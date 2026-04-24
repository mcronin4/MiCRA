# Database — Supabase Clients & Seeds

## Purpose
This module owns the two Supabase client singletons (admin and
per-request-authenticated) and the seed scripts that populate pre-built workflow
templates. It does NOT own table schema or RLS policy definitions (those are in
`backend/migrations/`), nor per-feature query logic (that lives in
`api/v1/` route files and `services/workflow_executor.py`).

## Architecture
`supabase.py` is imported by route handlers, services, and seed scripts.
`get_supabase()` returns the admin singleton (service-role key, bypasses RLS) —
used for internal server-side operations. `get_authenticated_supabase(token)` is
called per-request from `auth/dependencies.py` to produce an RLS-constrained
client scoped to the authenticated user.

Seed scripts are run manually against a target Supabase instance. They are the
canonical source of all pre-built workflow template definitions. A fresh instance
without seeds has no templates and the dashboard will appear empty.

## Contracts
- `get_supabase() -> SupabaseClient` — admin singleton, bypasses RLS. Use only
  for server-side operations that intentionally operate across user boundaries
  (e.g. seeding, background jobs). Never pass this client to user-facing logic.
- `get_authenticated_supabase(token) -> Client` — per-request, enforces RLS.
  This is the correct client for all user-scoped reads and writes.
- Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (admin
  singleton), `SUPABASE_ANON_KEY` (authenticated client).
- `seed_workflows.py` validates each template via `compile_workflow()` before
  inserting — seed failures indicate a schema mismatch between the seed data and
  the current `models/node_registry.py`.

## Pitfalls
- Confusing the two clients is a silent data-access security failure. The admin
  client will happily return or mutate other users' rows. There is no type
  distinction between them — both return `Client`. Always verify which one a
  function is receiving.
- `seed_linkedin_template.py` hardcodes `preset_id =
  "be078774-4e86-4a49-b156-03696eaa90f3"`. This UUID must exist in the
  `text_generation_presets` table of the target Supabase instance. It will
  silently produce a broken template on instances where this preset has a
  different ID or does not exist.
- Seed scripts are not idempotent by default — running them twice will attempt
  to insert duplicate rows. Check for existing records before re-seeding.
- `migrations/` SQL files are applied manually in the Supabase SQL editor. There
  is no Alembic or migration runner — migration state is not tracked. Applying
  the same migration twice may fail or produce duplicate policies.
