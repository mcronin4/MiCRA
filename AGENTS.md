# Micra — Monorepo Root

## Purpose
Micra is a multi-modal content-repurposing agent that ingests long-form company
content (call transcripts, papers, videos) and transforms it into platform-ready
outputs (LinkedIn posts, emails, TikTok scripts, short videos). This root node
owns facts that are globally true: the monorepo structure, the cross-stack
contracts, and the auth topology. It does NOT document either stack in detail —
those facts live in `backend/AGENTS.md` and `frontend/AGENTS.md`.

## Architecture
Two independent stacks with no monorepo tooling (the root `package-lock.json`
is vestigial and empty):
- `backend/` — Python ≥ 3.13, FastAPI, `uv` for deps, Supabase (server-side),
  Gemini + Fireworks AI.
- `frontend/` — TypeScript, Next.js 15 (App Router), `pnpm`, Supabase
  (browser-side), Vercel deployment.

Communication: the frontend calls the backend exclusively through the Next.js
`/backend/:path*` rewrite (proxied to `BACKEND_URL/api/...`). There is no
direct database access from the frontend — all DB operations go through FastAPI
routes.

Auth topology: Supabase issues JWTs. The backend verifies them via JWKS
(`backend/app/auth/`). The frontend holds the session via the Supabase browser
client (`frontend/src/lib/supabase/`). RLS policies in Supabase enforce
row-level access on the DB side.

## Contracts
**Three manual backend↔frontend sync points** are the highest blast-radius
locations in the repo. They have no code-gen enforcement — drift is silent.
Full details live at `backend/app/models/AGENTS.md`. In brief: node type keys,
port schemas, `RuntimeType` values, and `CONNECTED_INPUT_KEYS` must stay
identical across `backend/app/models/` and `frontend/src/lib/`.

**Claude Code rules (from `CLAUDE.md`):**
- Always read the nearest `AGENTS.md` before touching files in any directory.
- When writing an `AGENTS.md`, follow the schema in `.claude/skills/intent-layer/SKILL.md`.
- No AGENTS.md node may exceed 300 lines.

## Pitfalls
- The root `package-lock.json` exists but is empty (no dependencies). It is NOT
  a monorepo workspace root. All frontend dependencies are in `frontend/`.
- There is no CI pipeline configured (no `.github/workflows/`). The only
  automated gate is the pre-commit Husky hook in `frontend/`.
- CODEOWNERS (`*`) requires approval from both `@mcronin4` and `@coling03` for
  every PR. There is no path-based ownership differentiation — a frontend CSS
  change requires the same reviewers as a backend database migration.
- The README instructs `pip install -r requirements.txt` for backend setup, but
  `pyproject.toml` + `uv.lock` is the canonical dependency source. These may
  diverge. Prefer `uv sync`.

## Downlinks
- [backend](./backend/AGENTS.md) — Python FastAPI app; agents, services, API, auth, DB, storage
- [frontend](./frontend/AGENTS.md) — Next.js app; workflow builder, preview, API client, state stores
- [.claude](./.claude/AGENTS.md) — agent infrastructure; PostToolUse validation hook; intent-layer skill
