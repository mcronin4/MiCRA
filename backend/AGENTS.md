# Backend — Python FastAPI Application

## Purpose
This directory owns the entire server-side application: the FastAPI app, all AI
agents, workflow orchestration services, API routes, authentication, database
access, artifact storage, and the standalone audio transcription module. It does
NOT own the frontend UI, client-side state, or any Next.js configuration.

## Architecture
Entry point: `uvicorn app.main:app` from `backend/` (or
`fastapi dev main.py` from `backend/app/`).

Key dependency chain:
`api/v1/` routes → `services/` orchestration → `agents/` + `audio_transcription/`
→ `llm/gemini.py` (Gemini) or Fireworks AI (direct) → external LLM APIs.

Storage: `storage/` owns R2 (production) and local artifact backend (dev).
Auth: `auth/dependencies.py` provides JWT verification against Supabase JWKS.
DB: `db/supabase.py` provides admin and per-request Supabase clients.

`backend/audio_transcription/` sits outside the `app/` package — it is imported
via `sys.path` manipulation and predates the FastAPI structure.

## Contracts
- Python ≥ 3.13 required (`pyproject.toml`). The project uses `uv` for
  dependency management (`pyproject.toml` + `uv.lock`).
- Primary secrets required at startup: `GEMINI_API_KEY_1` (or
  `GEMINI_API_KEY`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY`. For full functionality also: `FIREWORK_API_KEY`,
  `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- `CORS_ORIGINS` defaults to `http://localhost:3000`. In production, set this
  to the Vercel deployment URL.
- Tests are run with `pytest` from `backend/`. The `backend/` directory must be
  on `PYTHONPATH` for `audio_transcription/` imports to resolve.

## Pitfalls
- The README instructs `pip install -r requirements.txt` but `pyproject.toml` is
  the canonical dependency source. A manually maintained `requirements.txt` may
  diverge silently. Prefer `uv sync` or `uv pip install -e .` over
  `pip install -r requirements.txt`.
- `pytest-asyncio` appears in runtime dependencies in `pyproject.toml` instead
  of dev dependencies — likely a misplacement. Do not rely on it being absent
  from production installs.
- `dotenv` and `python-dotenv` are both listed as dependencies — `dotenv` (older
  package) is likely a redundant inclusion alongside `python-dotenv`.
- `VEO_ENABLE_LIVE_CALLS=true` must be set explicitly to enable video generation.
  Without it every video generation call raises `RuntimeError`. This is
  intentional for CI environments but surprises developers on first setup.
- `backend/outputs/` is a generated artifacts directory. Do not commit its
  contents. It will be created by `image_extraction` if it does not exist.

## Downlinks
- [app/agents](./app/agents/AGENTS.md) — all AI task processors; no shared contract; Gemini vs Fireworks routing
- [app/services](./app/services/AGENTS.md) — workflow executor, compiler, copilot, voice bridge
- [app/api](./app/api/AGENTS.md) — all FastAPI routes; auth gap on 5 endpoints; legacy hitl/trigger_job routes
- [app/models](./app/models/AGENTS.md) — Blueprint and NODE_REGISTRY; three manual frontend sync points
- [app/llm](./app/llm/AGENTS.md) — Gemini key rotation singleton; shared by all Gemini-calling agents
- [app/auth](./app/auth/AGENTS.md) — JWT verification; dual dependency pattern; auth-guard gaps
- [app/db](./app/db/AGENTS.md) — admin vs RLS clients; seed scripts with hardcoded UUID
- [app/storage](./app/storage/AGENTS.md) — R2 vs local artifact backends; executor bypass
- [audio_transcription](./audio_transcription/AGENTS.md) — standalone Fireworks Whisper; sys.path import hack
