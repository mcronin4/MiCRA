# Authentication — Dependencies

## Purpose
This module owns JWT verification against Supabase JWKS and the two FastAPI
dependency functions injected into route handlers. It does NOT own user
registration or login flows (handled by Supabase Auth on the client side), token
refresh, or session management. It does NOT decide which routes require auth —
that is each route file's responsibility (and several routes currently omit it).

## Architecture
`get_current_user` and `get_supabase_client` are FastAPI dependencies used as
`Depends(...)` arguments in route handlers. The JWKS client singleton is created
via `get_jwks_client()` (LRU-cached) and pre-warmed at app startup by
`main.py`. Most routes use both dependencies together; `get_supabase_client`
alone gives an RLS-constrained DB client without a `User` object.

## Contracts
- `get_current_user(authorization: Header) -> User` — verifies the JWT using
  Supabase JWKS (RS256/ES256), returns a `User(sub, email?, role?)`. Raises
  `HTTPException(401)` on any failure.
- `get_supabase_client(authorization: Header) -> Client` — strips the `Bearer`
  prefix and creates an RLS-constrained Supabase client (anon key + user JWT).
  It does NOT re-verify the JWT — it trusts Supabase RLS to enforce access
  control. Never use this client for operations that should bypass RLS.
- Required env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
  Optional: `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE` (default
  `"authenticated"`).

## Pitfalls
- Several API routes have NO auth guard — see `api/AGENTS.md` for the full list.
  Do not assume all routes are protected when adding features near them.
- `get_supabase_client` trusts the Supabase RLS layer completely. A misconfigured
  RLS policy is not caught here — it silently exposes or blocks data. When adding
  new tables, always apply RLS policies via `migrations/` before using this
  client against them.
- If Supabase is unreachable at app startup, `main.py` pre-warms the JWKS
  client, which will raise. The app will fail to start rather than degrading
  gracefully.
- The JWKS client is LRU-cached with `maxsize=1`. If Supabase rotates its
  signing keys, the cached client will reject valid tokens until the process
  restarts. There is no automatic invalidation.
