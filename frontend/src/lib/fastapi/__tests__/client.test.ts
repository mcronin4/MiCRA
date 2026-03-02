/**
 * Unit tests for ApiClient session caching and request deduplication
 *
 * These tests verify that:
 * 1. Session caching reduces repeated getSession() calls
 * 2. Request deduplication prevents duplicate in-flight requests
 * 3. Cache invalidation works correctly
 */

import { apiClient } from '../client';
import { supabase } from '@/lib/supabase/client';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('ApiClient Session Caching', () => {
  let dateNowSpy: jest.SpyInstance;
  let getSessionSpy: jest.SpyInstance;
  let mockTime = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTime = Date.now();

    // Clear all caches before each test
    apiClient.invalidateSessionCache();
    apiClient.invalidateRequestCache();

    // Mock Date.now() to control time
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

    // Mock supabase.auth.getSession using jest.spyOn
    getSessionSpy = jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token-123',
          user: { id: 'test-user' },
        },
      },
      error: null,
    } as ReturnType<typeof supabase.auth.getSession>);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    getSessionSpy.mockRestore();
  });

  test('should cache session for multiple requests', async () => {
    // Make two API requests
    await apiClient.request('/v1/workflows');
    await apiClient.request('/v1/workflows/123');

    // Should only call getSession once (cached for second request)
    expect(getSessionSpy).toHaveBeenCalledTimes(1);

    // Both requests should have been made with the auth header
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe(
      'Bearer test-token-123'
    );
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization).toBe(
      'Bearer test-token-123'
    );
  });

  test('should refresh session after cache expires (30s)', async () => {
    // First request
    await apiClient.request('/v1/workflows');
    expect(getSessionSpy).toHaveBeenCalledTimes(1);

    // Advance time by 31 seconds (past 30s TTL)
    mockTime += 31000;

    // Second request should fetch fresh session
    await apiClient.request('/v1/workflows');
    expect(getSessionSpy).toHaveBeenCalledTimes(2);
  });

  test('should use cached session within TTL window', async () => {
    // First request
    await apiClient.request('/v1/workflows');
    expect(getSessionSpy).toHaveBeenCalledTimes(1);

    // Advance time by only 15 seconds (within 30s TTL)
    mockTime += 15000;

    // Second request should use cached session
    await apiClient.request('/v1/workflows');
    expect(getSessionSpy).toHaveBeenCalledTimes(1);

    // Advance by another 10 seconds (total 25s, still within TTL)
    mockTime += 10000;

    // Third request should still use cached session
    await apiClient.request('/v1/workflows');
    expect(getSessionSpy).toHaveBeenCalledTimes(1);
  });

  test('should handle session errors gracefully', async () => {
    // Mock getSession to fail
    getSessionSpy.mockRejectedValue(
      new Error('Session fetch failed')
    );

    // Request should still work, just without auth header
    await apiClient.request('/v1/public/data');

    expect(getSessionSpy).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Should not have Authorization header
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers.Authorization).toBeUndefined();
  });

  test('should handle null session (logged out user)', async () => {
    // Mock no session (user logged out)
    getSessionSpy.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await apiClient.request('/v1/public/data');

    // Should make request without auth header
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers.Authorization).toBeUndefined();
  });

  test('should cache null session and not retry getSession', async () => {
    // Mock no session
    getSessionSpy.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    // Make multiple requests
    await apiClient.request('/v1/public/data');
    await apiClient.request('/v1/public/data');
    await apiClient.request('/v1/public/data');

    // Should only call getSession once, then cache the null result
    expect(getSessionSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ApiClient Request Deduplication', () => {
  let dateNowSpy: jest.SpyInstance;
  let getSessionSpy: jest.SpyInstance;
  let mockTime = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTime = Date.now();

    // Clear all caches before each test
    apiClient.invalidateSessionCache();
    apiClient.invalidateRequestCache();

    // Mock Date.now() to control time
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

    // Mock supabase.auth.getSession using jest.spyOn
    getSessionSpy = jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token-123',
          user: { id: 'test-user' },
        },
      },
      error: null,
    } as ReturnType<typeof supabase.auth.getSession>);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    getSessionSpy.mockRestore();
  });

  test('should deduplicate concurrent identical GET requests', async () => {
    // Mock fetch to return immediately
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    // Make 3 identical concurrent requests
    const promises = [
      apiClient.request('/v1/workflows/123'),
      apiClient.request('/v1/workflows/123'),
      apiClient.request('/v1/workflows/123'),
    ];

    const results = await Promise.all(promises);

    // Should only make 1 actual fetch call (deduped)
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // All should return the same result
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
  });

  test('should NOT deduplicate POST/PUT/DELETE requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    // Make multiple POST requests to same endpoint
    await apiClient.request('/v1/workflows', { method: 'POST', body: JSON.stringify({ name: 'test1' }) });
    await apiClient.request('/v1/workflows', { method: 'POST', body: JSON.stringify({ name: 'test2' }) });

    // Should make both requests (no deduplication for mutations)
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('should cache GET requests for 10 seconds', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    // First request
    await apiClient.request('/v1/workflows');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second request after 5 seconds (within cache TTL)
    mockTime += 5000;
    await apiClient.request('/v1/workflows');
    expect(global.fetch).toHaveBeenCalledTimes(1); // Should use cache

    // Third request after total 11 seconds (cache expired)
    mockTime += 6000;
    await apiClient.request('/v1/workflows');
    expect(global.fetch).toHaveBeenCalledTimes(2); // Should make new request
  });

  test('should differentiate requests by endpoint and method', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    // Different endpoints should not be deduped
    await apiClient.request('/v1/workflows');
    await apiClient.request('/v1/workflows/123');

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Same endpoint but different methods should not be deduped
    // (Note: First call to /v1/workflows is cached, so use different endpoint)
    await apiClient.request('/v1/files', { method: 'GET' });
    await apiClient.request('/v1/files', { method: 'POST' });

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  test('should handle cache size limits (LRU eviction)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    // Make 51 requests to different endpoints to exceed cache limit (50)
    const requests = [];
    for (let i = 0; i < 51; i++) {
      requests.push(apiClient.request(`/v1/workflows/${i}`));
    }
    await Promise.all(requests);

    // All 51 requests should have been made
    expect(global.fetch).toHaveBeenCalledTimes(51);

    // Now request the first endpoint again (should have been evicted)
    await apiClient.request('/v1/workflows/0');

    // Should make a new request since it was evicted from cache
    expect(global.fetch).toHaveBeenCalledTimes(52);
  });
});

describe('ApiClient Cache Invalidation', () => {
  let getSessionSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear all caches before each test
    apiClient.invalidateSessionCache();
    apiClient.invalidateRequestCache();

    // Mock supabase.auth.getSession using jest.spyOn
    getSessionSpy = jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token-123',
          user: { id: 'test-user' },
        },
      },
      error: null,
    } as ReturnType<typeof supabase.auth.getSession>);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });
  });

  afterEach(() => {
    getSessionSpy.mockRestore();
  });

  test('should expose invalidateSessionCache method', () => {
    expect(typeof apiClient.invalidateSessionCache).toBe('function');
  });

  test('should expose invalidateRequestCache method', () => {
    expect(typeof apiClient.invalidateRequestCache).toBe('function');
  });

  test('should clear session cache when invalidated', async () => {
    // Make first request
    await apiClient.request('/v1/workflows');
    expect(getSessionSpy).toHaveBeenCalledTimes(1);

    // Invalidate both session and request caches
    apiClient.invalidateSessionCache();
    apiClient.invalidateRequestCache();

    // Next request should fetch fresh session (and not use cached request)
    await apiClient.request('/v1/workflows');
    expect(getSessionSpy).toHaveBeenCalledTimes(2);
  });

  test('should clear all request cache when invalidated with no pattern', async () => {
    // Make multiple requests
    await apiClient.request('/v1/workflows');
    await apiClient.request('/v1/files');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Invalidate all caches
    apiClient.invalidateRequestCache();

    // Both should make new requests
    await apiClient.request('/v1/workflows');
    await apiClient.request('/v1/files');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  test('should invalidate only matching request caches with pattern', async () => {
    // Make requests to different endpoints
    await apiClient.request('/v1/workflows/123');
    await apiClient.request('/v1/files/456');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Invalidate only workflow caches
    apiClient.invalidateRequestCache('/v1/workflows');

    // Workflow request should make new call, files should use cache
    await apiClient.request('/v1/workflows/123');
    await apiClient.request('/v1/files/456');

    // Only workflow should make new request
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
