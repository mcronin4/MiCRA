# API Routes — v1

## Purpose
This module owns all FastAPI route definitions. `routes.py` assembles the
`api_router` mounted at `/api` with all v1 sub-routers. It does NOT own auth
verification logic (in `auth/dependencies.py`), business or generation logic
(in `agents/` and `services/`), or database schema (in `migrations/`).

## Architecture
`v1/` contains one file per feature domain. All request/response models are
defined as inline Pydantic `BaseModel` subclasses within each route file — there
is no shared request/response model package.

The two most complex route files:
- `workflows.py` — full workflow CRUD, copilot planning, SSE streaming execution,
  run-output history. The SSE stream uses `StreamingResponse` with
  `text/event-stream`.
- `files.py` — R2 file lifecycle with single-part and multipart upload paths,
  presigned download URLs, an in-memory listing cache (10-min TTL), and
  hash-based deduplication.

## Contracts
- Auth guard: most routes use `Depends(get_current_user)`. Five routes
  intentionally lack it: `image_matching`, `image_generation`,
  `video_generation`, `quote_extraction`, `trigger_job`. This is a known gap.
- `POST /api/v1/workflows/copilot/plan` enforces a hard 8000-character limit on
  the `message` field. Requests exceeding this are rejected with a 422.
- File upload limits: `MAX_FILE_SIZE_BYTES = 1 GB`, multipart threshold
  `200 MB`, chunk size `50 MB`. HEIC/HEIF file types are blocked at upload.
- In-memory file listing cache: 10-min TTL, invalidated on any mutation. In a
  multi-replica deployment, invalidation only affects the local replica — other
  replicas will serve stale listings for up to 10 minutes.
- SSE event shape is consumed by `frontend/src/lib/fastapi/workflows.ts`; the
  frontend decodes it with a manual `ReadableStream` parser, not `EventSource`.

## Pitfalls
- `hitl.py` and `trigger_job.py` are legacy routes largely superseded by the
  workflow execution engine. New callers should use
  `POST /api/v1/workflows/{id}/execute`. These legacy routes remain because
  some older integrations still call them — do not delete without checking
  consumers.
- `hitl.py` maintains a `conversation_state` dict in module scope — this is
  per-process, not per-user or per-session. In a multi-worker or multi-instance
  deployment it will behave incorrectly.
- The `text_generation.py` route controls preset access: presets with `null`
  `user_id` are system-wide public presets readable by all users. Presets with
  a `user_id` are user-scoped. This distinction is enforced in the query logic,
  not via RLS.
- `transcription.py` uses a `sys.path` import hack — see
  `audio_transcription/AGENTS.md` for the full context and risks.
