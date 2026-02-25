// Base configuration

import { supabase } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

class HttpError extends Error {
    status: number;
    
    constructor(message: string, status: number) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

class ApiClient {
    // Session caching (30-second TTL to reduce auth overhead)
    private sessionCache: { session: Session | null; cachedAt: number } | null = null;
    private readonly SESSION_CACHE_TTL = 30000; // 30 seconds

    // Request deduplication and caching
    private requestCache = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();
    private inFlightRequests = new Map<string, Promise<unknown>>();
    private readonly REQUEST_CACHE_TTL = 10000; // 10 seconds
    private readonly MAX_CACHE_SIZE = 50; // LRU eviction threshold

    private getBaseUrl(): string {
        // Simple: use environment variable if set, otherwise use rewrite
        const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (envUrl) {
            const cleanUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
            return `${cleanUrl}/api`;
        }
        return '/backend';
    }

    private async getAuthHeaders(): Promise<HeadersInit> {
        const now = Date.now();
        const headers: HeadersInit = {};

        // Check if we have a valid cached session
        if (this.sessionCache && (now - this.sessionCache.cachedAt) < this.SESSION_CACHE_TTL) {
            if (this.sessionCache.session?.access_token) {
                headers['Authorization'] = `Bearer ${this.sessionCache.session.access_token}`;
            }
            return headers;
        }

        // Fetch fresh session
        try {
            const { data: { session } } = await supabase.auth.getSession();
            this.sessionCache = { session, cachedAt: now };

            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }
        } catch (error) {
            // Cache the failure to avoid repeated failed calls
            this.sessionCache = { session: null, cachedAt: now };
            console.warn('Failed to get auth session for API request:', error);
        }
        return headers;
    }

    /**
     * Invalidate the session cache, forcing a fresh getSession() call on next request
     * Useful after logout or when session state changes
     */
    invalidateSessionCache(): void {
        this.sessionCache = null;
    }

    /**
     * Invalidate request cache entries
     * @param pattern - Optional URL pattern to match (e.g., '/v1/workflows')
     *                  If not provided, clears all cached requests
     */
    invalidateRequestCache(pattern?: string): void {
        if (pattern) {
            // Invalidate matching entries
            for (const key of this.requestCache.keys()) {
                if (key.includes(pattern)) {
                    this.requestCache.delete(key);
                }
            }
        } else {
            // Clear all
            this.requestCache.clear();
        }
    }

    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const method = options.method || 'GET';
        const cacheKey = `${method}:${endpoint}`;

        // Only cache and deduplicate GET requests
        if (method === 'GET') {
            const now = Date.now();

            // Check cache first
            const cached = this.requestCache.get(cacheKey);
            if (cached && now < cached.expiresAt) {
                return cached.promise as Promise<T>;
            }

            // Check if request already in-flight (deduplication)
            const inFlight = this.inFlightRequests.get(cacheKey);
            if (inFlight) {
                return inFlight as Promise<T>;
            }
        }

        // Create and immediately register the promise for deduplication
        // This must happen synchronously before any await
        const requestPromise = this.executeRequest<T>(endpoint, options);

        // Register for deduplication BEFORE any async operations
        if (method === 'GET') {
            this.inFlightRequests.set(cacheKey, requestPromise);

            // Clean up after request completes
            requestPromise.finally(() => {
                this.inFlightRequests.delete(cacheKey);
            });

            // Cache successful GET requests
            requestPromise.then(() => {
                const now = Date.now();
                this.requestCache.set(cacheKey, {
                    promise: requestPromise,
                    expiresAt: now + this.REQUEST_CACHE_TTL
                });

                // LRU eviction (keep cache size reasonable)
                if (this.requestCache.size > this.MAX_CACHE_SIZE) {
                    const firstKey = Array.from(this.requestCache.keys())[0];
                    if (firstKey) {
                        this.requestCache.delete(firstKey);
                    }
                }
            }).catch(() => {
                // Don't cache failed requests
            });
        }

        return requestPromise;
    }

    private async executeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        // Don't set Content-Type for FormData - browser will set it with boundary
        const isFormData = options.body instanceof FormData;
        const headers: HeadersInit = {};

        // Get auth headers (includes Bearer token if available)
        const authHeaders = await this.getAuthHeaders();
        Object.assign(headers, authHeaders);

        if (!isFormData && options.headers) {
            Object.assign(headers, options.headers);
        } else if (options.headers && !isFormData) {
            Object.assign(headers, options.headers);
        }

        const baseUrl = this.getBaseUrl();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const fullUrl = `${baseUrl}${cleanEndpoint}`;

        let response: Response;
        try {
            response = await fetch(fullUrl, {
                ...options,
                headers: isFormData ? authHeaders : headers, // Preserve auth headers even for FormData
            });
        } catch (error) {
            // Handle network errors (Failed to fetch, CORS, etc.)
            const errorMessage = error instanceof Error ? error.message : "Unknown network error";
            let detailedMessage = `Network error: ${errorMessage}`;

            // Provide helpful context for common network errors
            if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
                detailedMessage = `Failed to connect to backend at ${fullUrl}. ` +
                    `Please ensure the backend server is running and accessible. ` +
                    `Error: ${errorMessage}`;
            } else if (errorMessage.includes("CORS")) {
                detailedMessage = `CORS error: The backend may not be configured to allow requests from this origin. ` +
                    `Error: ${errorMessage}`;
            }

            console.error("API request failed:", {
                url: fullUrl,
                method: options.method || "GET",
                error: detailedMessage,
            });

            throw new HttpError(detailedMessage, 0); // Status 0 indicates network error
        }

        if (!response.ok) {
            // Try to extract error details from FastAPI response
            let errorMessage = `HTTP error! status: ${response.status}`;
            let errorDetail: unknown = null;
            try {
                const errorData = await response.json();
                // FastAPI returns errors in a 'detail' field
                if (errorData.detail) {
                    errorDetail = errorData.detail;
                    // If detail is an object, stringify it as JSON so it can be parsed back
                    if (typeof errorData.detail === 'object') {
                        errorMessage = JSON.stringify(errorData.detail);
                    } else {
                        errorMessage = String(errorData.detail);
                    }
                } else if (errorData.error) {
                    errorMessage = errorData.error;
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                }
            } catch {
                // If we can't parse the error, use the status message
                errorMessage = `HTTP error! status: ${response.status} ${response.statusText}`;
            }
            const httpError = new HttpError(errorMessage, response.status);
            // Attach the original detail object if available for structured error handling
            if (errorDetail) {
                (httpError as { detail?: unknown }).detail = errorDetail;
            }
            throw httpError;
        }

        // Handle 204 No Content responses (common for DELETE operations)
        if (response.status === 204) {
            return undefined as T;
        }

        return response.json();
    }
}
  
export const apiClient = new ApiClient();