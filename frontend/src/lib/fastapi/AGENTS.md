# API Client Layer — FastAPI

## Purpose
This directory owns all typed client functions for calling the FastAPI backend.
One file per backend endpoint group, all sharing a single `ApiClient` singleton
from `client.ts`. It does NOT own business logic, state management (in
`lib/stores/`), or URL routing — it is a pure transport layer.

## Architecture
`client.ts` exports the `apiClient` singleton. All other modules in this
directory import it. The singleton handles Supabase session retrieval (cached
30 s), GET response deduplication with a 10-second LRU cache (max 50 entries),
and error normalization to `HttpError`.

The base URL resolves as: `NEXT_PUBLIC_BACKEND_URL` env var → `/backend` (which
the Next.js rewrite proxies to the backend). The SSE streaming path in
`workflows.ts` is the exception — see Pitfalls.

The `StreamingExecutionEvent` discriminated union is defined here and is the
canonical frontend type for all SSE execution events.

## Contracts
- `apiClient` is a singleton — all modules share one session cache and one GET
  cache. Mutations (`POST`, `PUT`, `DELETE`) do not invalidate the GET cache
  automatically. If you add a mutation that should invalidate a cached GET,
  call `apiClient.clearCache()` explicitly.
- `HttpError extends Error { status: number }` — not exported. Callers detect
  it via `'status' in err`. `instanceof HttpError` will not work across module
  boundaries.
- `StreamingExecutionEvent` is a discriminated union with variants:
  `workflow_start`, `node_start`, `node_complete`, `node_error`,
  `workflow_complete`, `workflow_error`. All other SSE lines are ignored.
- `NodeOverrides = Record<string, Record<string, unknown>>` is the shape for
  per-node input overrides passed to the streaming execute call.

## Pitfalls
- SSE streaming in `workflows.ts` uses raw `fetch` + `ReadableStream` with
  manual line parsing — NOT the browser's `EventSource` API. This is required
  because `EventSource` cannot send custom headers (Authorization). In local
  development the stream bypasses the Next.js `/backend` rewrite and hits
  `http://127.0.0.1:8000/api` directly (hardcoded fallback). If the backend
  runs on a different host or port locally, the stream will fail silently while
  other API calls succeed.
- The GET cache uses a 10-second TTL. In tests that assert on updated data
  immediately after a mutation, the cache may return stale results. Call
  `apiClient.clearCache()` between mutate and assert in such tests.
- Session caching (30-second TTL) means the first request after token expiry
  may use a stale session and receive a 401. The client does not auto-retry on
  401 — the error propagates to the caller.
- `workflows.ts` contains both CRUD functions and the copilot planning function.
  The file is the largest in this directory. If adding new workflow-related
  endpoints, prefer adding them here rather than creating a new file.
