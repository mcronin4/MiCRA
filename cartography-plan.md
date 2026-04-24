# Intent Layer Cartography Plan

## 1. Top-Level Directory Ownership

| Directory | Ownership (one sentence) |
|-----------|-------------------------|
| `backend/` | Python FastAPI application: all server-side logic, AI agents, API routes, database access, and artifact storage. |
| `frontend/` | Next.js 14 (App Router) application: workflow builder UI, content preview system, dashboard, auth flows, and all client-side state. |
| `docs/` | Sparse — contains a single NotebookLM prompt file; not an active documentation root. |
| `.github/` | Repository governance — currently only a CODEOWNERS file. |
| `.claude/` | Claude Code configuration: hooks, skills (including the Intent Layer skill definition). |

### Inside `backend/`

| Directory | Ownership |
|-----------|-----------|
| `backend/app/` | The FastAPI application package — everything that runs at `uvicorn app.main:app`. |
| `backend/app/agents/` | Parent of all AI task processors; each child implements one content-transformation capability. |
| `backend/app/agents/image_extraction/` | Extracts keyframes from video using scene detection and perceptual hashing (pHash). |
| `backend/app/agents/image_generation/` | Generates images via AI (single-file generator). |
| `backend/app/agents/image_text_matching/` | Matches images to text using a VLM pipeline (Gemini Vision); owns custom config, types, and analysis logic. |
| `backend/app/agents/quote_extraction/` | Extracts notable quotes from source content. |
| `backend/app/agents/summarization/` | Summarizes source content (single-file summarizer). |
| `backend/app/agents/text_generation/` | Generates platform-specific content (LinkedIn, email, TikTok, chatbot) from source material — the most multi-file agent. |
| `backend/app/agents/transcription/` | Transcribes audio/video to text (thin — only a `__pycache__` visible, logic may live elsewhere). |
| `backend/app/agents/video_generation/` | Generates short videos via Google Veo 3.1 with a smart preprocessing layer (image selection, prompt enhancement). |
| `backend/app/api/` | FastAPI route layer; `v1/` contains versioned endpoint files mirroring each agent plus workflows, auth, HITL, files, and voice. |
| `backend/app/auth/` | Authentication dependency injection (Supabase-based). |
| `backend/app/db/` | Database access — Supabase client, seed scripts for workflows and LinkedIn templates. |
| `backend/app/llm/` | LLM client abstraction — Gemini with API key rotation. |
| `backend/app/models/` | Data models: blueprint schema and node registry (defines the vocabulary of workflow nodes). |
| `backend/app/quality/` | Empty `__init__.py` only — purpose unclear (see Uncertainties). |
| `backend/app/services/` | Orchestration layer: workflow executor (runs agent graphs), workflow copilot (AI-assisted workflow building), blueprint compiler, Gradium voice. |
| `backend/app/storage/` | Artifact storage abstraction — local filesystem and Cloudflare R2. |
| `backend/audio_transcription/` | Standalone transcription module outside the app package (see Uncertainties). |
| `backend/migrations/` | SQL migration files (isolation policy, executions table, workflow outputs table). |
| `backend/scripts/` | Developer scripts for registering assets, running video generation, and verifying isolation. |
| `backend/tests/` | Backend test suite (13 test files covering agents, workflows, copilot, performance). |
| `backend/outputs/` | Generated output artifacts directory. |

### Inside `frontend/`

| Directory | Ownership |
|-----------|-----------|
| `frontend/src/` | All source code for the Next.js app. |
| `frontend/src/app/` | Next.js App Router pages: `auth/`, `dashboard/`, `workflow/`, `preview/[workflowId]`, `final-review/`, `signup/`. |
| `frontend/src/components/` | React component library, organized by domain. |
| `frontend/src/components/workflow/` | The workflow builder: canvas, chat panel, execution bar, node sidebar, MicrAI overlay/dock, and 21 node-type components in `nodes/`. |
| `frontend/src/components/preview/` | Content preview system: draft mode, slot assignment, platform-specific previews, run selection. |
| `frontend/src/components/dashboard/` | Dashboard page components (workflow list, create modal). |
| `frontend/src/components/ui/` | Shared UI primitives (Modal, Toast, Button). |
| `frontend/src/components/auth/` | Auth modal, login/signup forms. |
| `frontend/src/hooks/` | 13 custom React hooks bridging components to services (workflow execution, copilot, transcription, voice, canvas ops, etc.). |
| `frontend/src/contexts/` | React contexts — currently only AuthContext. |
| `frontend/src/lib/` | Client utilities and API layer. |
| `frontend/src/lib/fastapi/` | Typed API client functions — one file per backend endpoint group (mirrors `backend/app/api/v1/`). |
| `frontend/src/lib/supabase/` | Supabase client setup. |
| `frontend/src/lib/stores/` | Zustand/state stores (preview, toast, workflow). |
| `frontend/src/lib/storage/` | Client-side storage utilities (R2 upload, HEIC conversion, CORS debug). |
| `frontend/src/types/` | Shared TypeScript type definitions (workflow, blueprint, preview, execution). |
| `frontend/e2e/` | Playwright end-to-end tests. |
| `frontend/tests/` | Unit/integration tests. |
| `frontend/scripts/` | Frontend tooling (benchmark, asset checks). |
| `frontend/public/` | Static assets (robot mascot sprites, SVGs). |

---

## 2. Uncertainties

| Directory | Uncertainty | Why |
|-----------|------------|-----|
| `backend/app/quality/` | **Purpose unknown.** Contains only an empty `__init__.py`. Could be a planned output-quality scoring module, or abandoned scaffolding. | No code, no imports referencing it found at this depth. |
| `backend/audio_transcription/` | **Unclear relationship to `backend/app/agents/transcription/`.** This sits outside `app/` as a standalone module with its own `setup.md`. The agents/transcription dir has only `__pycache__`. | Possible legacy module, or an independently-runnable tool that the agent wraps. Needs deeper reading before placing a node. |
| `docs/` | **Not a real documentation root.** Contains one file (`notebooklm_system_design_flowchart_prompt.md`). | Too sparse to warrant an AGENTS.md node. May not survive cleanup. |
| `backend/app/agents/transcription/` | **Possibly empty.** Only `__pycache__` visible — the actual logic may live in `audio_transcription/` or be imported from elsewhere. | Need to read imports to confirm where transcription logic actually lives. |
| `frontend/src/lib/` | **Blurry boundary.** Contains a mix of API clients, state stores, storage utils, and general utilities at the same level. | The subdirectories (`fastapi/`, `stores/`, `storage/`, `supabase/`) are clear, but the loose files (`utils.ts`, `debug.ts`, `nodeRegistry.ts`, `workflowLayout.ts`, `preview-utils.ts`) blur the boundary. |

---

## 3. Node Placement Plan

Nodes are placed at **semantic boundaries** — points where a developer would need to context-switch (different language, different domain, different abstraction level, different team ownership).

### Tier 1: Root node (depth 0)

| Location | Justification |
|----------|---------------|
| `/AGENTS.md` | **The monorepo root.** Owns the frontend/backend split, shared contracts (Supabase auth, API shape, deployment model), and the "what MiCRA is" context that every agent needs. Written last per protocol. |

### Tier 2: Stack boundaries (depth 1)

| Location | Justification |
|----------|---------------|
| `/backend/AGENTS.md` | **Language and runtime boundary.** Entering here means switching to Python, FastAPI, uv/pip, Supabase-server-side. Owns backend-wide concerns: environment setup, Gemini key rotation pattern, test running conventions. |
| `/frontend/AGENTS.md` | **Language and runtime boundary.** Entering here means switching to TypeScript, Next.js App Router, pnpm, Supabase-client-side. Owns frontend-wide concerns: build config, middleware, Vercel deployment, linting/formatting. |

### Tier 3: Architectural layers (depth 2)

| Location | Justification |
|----------|---------------|
| `/backend/app/agents/AGENTS.md` | **The agent system boundary.** All AI task processors share patterns (input/output schemas, Gemini usage, how they're called by services). A developer modifying one agent needs to understand the shared contract before touching any leaf. |
| `/backend/app/services/AGENTS.md` | **Orchestration boundary.** The services layer (workflow executor, copilot, blueprint compiler) is the layer that wires agents together. Distinct mental model from individual agents — graph execution, parallel dispatch, compilation. |
| `/backend/app/api/AGENTS.md` | **API surface boundary.** Route definitions, request validation, response shaping. A developer here needs to know the versioning convention, auth middleware, and how routes map to services. |
| `/backend/app/models/AGENTS.md` | **Data model boundary.** Blueprint schema and node registry define the vocabulary that both frontend and backend must agree on. High-impact change zone. |
| `/frontend/src/components/workflow/AGENTS.md` | **The workflow builder boundary.** This is the most complex frontend surface — React Flow canvas, node system, chat panel, execution. A developer entering here needs the component topology and data flow before touching anything. |
| `/frontend/src/components/preview/AGENTS.md` | **The preview system boundary.** Complex subsystem with slots, drafts, platform-specific renderers, DnD. Distinct mental model from the workflow builder. |
| `/frontend/src/lib/AGENTS.md` | **Client infrastructure boundary.** API client layer, state stores, storage — the "how the frontend talks to everything else" layer. |

### Tier 4: Complex leaves (depth 3) — only where warranted by complexity

| Location | Justification |
|----------|---------------|
| `/backend/app/agents/text_generation/AGENTS.md` | **Most complex agent.** 6 files, multiple content types (LinkedIn, email, TikTok, chatbot), each with distinct prompt engineering. Context-switch from other agents. |
| `/backend/app/agents/video_generation/AGENTS.md` | **Complex constraints.** Veo 3.1 API constraints, preprocessing pipeline, image selection logic. Non-obvious gotchas documented in VIDEO_GENERATION_PIPELINE.md that should live closer to the code. |
| `/backend/app/agents/image_extraction/AGENTS.md` | **Complex pipeline.** Scene detection, pHash deduplication, keyframe pipeline, ResNet model file. Multiple algorithms with tuning parameters. |
| `/backend/app/agents/image_text_matching/AGENTS.md` | **Custom VLM pipeline.** Has its own config, types, and multi-step analysis. Distinct enough to warrant its own node. |
| `/backend/app/storage/AGENTS.md` | **Dual-backend abstraction.** Local vs R2, with implications for dev vs prod. A developer touching storage needs to know which backend is active and how artifacts flow. |
| `/backend/app/llm/AGENTS.md` | **Gemini key rotation.** The rotation pattern is non-obvious and affects every agent. This is better as its own node than repeated in each agent. |

### Directories that should NOT get nodes

| Directory | Why not |
|-----------|---------|
| `docs/` | Too sparse, not a semantic boundary. |
| `.github/` | Only CODEOWNERS — no meaningful context to surface. |
| `backend/outputs/` | Generated artifacts, not code. |
| `backend/app/auth/` | Single file (`dependencies.py`). Context fits in `/backend/app/AGENTS.md`. |
| `backend/app/db/` | Three files, mostly seeds. Context fits in `/backend/app/AGENTS.md`. |
| `backend/app/quality/` | Empty — no content to document. |
| `frontend/src/contexts/` | Single file. Context fits in `/frontend/AGENTS.md`. |
| `frontend/src/hooks/` | 13 files but they're thin bridges. Document in `/frontend/src/components/workflow/AGENTS.md` and sibling nodes as relevant. |
| `frontend/src/types/` | Type files — their contracts are visible in the code itself. |
| `frontend/src/components/ui/` | Thin shared primitives. No context-switch needed. |
| `frontend/src/components/dashboard/` | Three files, straightforward CRUD list. |
| `frontend/src/components/auth/` | Three files, standard auth forms. |
| `frontend/e2e/`, `frontend/tests/`, `backend/tests/` | Test conventions belong in their parent's Pitfalls section, not their own node. |
| `frontend/scripts/`, `backend/scripts/` | Dev tooling — document in parent node. |
| Simple agents (`summarization/`, `quote_extraction/`, `image_generation/`, `transcription/`) | Single-file agents. Their contract fits in `/backend/app/agents/AGENTS.md`. |

---

## 4. Least Common Ancestor Analysis

These are pieces of shared knowledge that must live at the **shallowest node covering all consumers**, never duplicated in leaves:

| Shared Knowledge | LCA Node | Consumers |
|-----------------|----------|-----------|
| **Gemini API key rotation pattern** | `/backend/app/llm/AGENTS.md` | Every agent that calls Gemini. Agents link here, don't re-explain. |
| **Agent input/output schema contract** (how agent return types map to API responses) | `/backend/app/agents/AGENTS.md` | All individual agents, `api/v1/` routes, `services/workflow_executor`. |
| **Blueprint/node registry vocabulary** (node types, port schemas) | `/backend/app/models/AGENTS.md` | Frontend node components, backend node registry, blueprint compiler, workflow executor. |
| **Supabase auth flow** (JWT verification, RLS policies, client vs server usage) | `/AGENTS.md` (root) | `backend/app/auth/`, `backend/app/db/`, `frontend/src/lib/supabase/`, `frontend/src/contexts/AuthContext`. |
| **Storage abstraction** (R2 vs local, artifact URL patterns) | `/backend/app/storage/AGENTS.md` | Agents that produce artifacts, API routes that serve them, frontend storage utils. |
| **Workflow execution model** (how a blueprint compiles to a DAG, parallel execution, HITL gates) | `/backend/app/services/AGENTS.md` | Workflow executor, copilot, frontend execution hooks, API trigger routes. |
| **Frontend-backend API contract** (base URL, auth headers, error shapes) | `/AGENTS.md` (root) | All `frontend/src/lib/fastapi/` clients, all `backend/app/api/v1/` routes. |
| **Content type taxonomy** (which platforms exist, what fields each requires) | `/backend/app/agents/text_generation/AGENTS.md` | Text generation sub-generators, frontend preview platform selectors, node type components. |

---

## 5. Proposed Writing Order

Per the protocol (leaves first, root last):

1. **Leaf agents:** `text_generation`, `video_generation`, `image_extraction`, `image_text_matching`
2. **Leaf infrastructure:** `storage`, `llm`
3. **Mid-level backend:** `agents/`, `services/`, `api/`, `models/`
4. **Mid-level frontend:** `components/workflow/`, `components/preview/`, `lib/`
5. **Stack roots:** `backend/`, `frontend/`
6. **Monorepo root:** `/` (last)

---

## 6. Open Questions (to resolve before Phase 2)

1. What is `backend/app/quality/` for? Read imports and git history to determine if it's active, planned, or dead.
2. What is the relationship between `backend/audio_transcription/` and `backend/app/agents/transcription/`? One may wrap the other, or the standalone module may be legacy.
3. Does `backend/app/agents/transcription/` contain any actual code, or is it purely a re-export? Only `__pycache__` is visible.
4. Should `frontend/src/lib/fastapi/` get its own node? It mirrors the backend API surface 1:1 and has 11 files. Currently proposed to be covered by `/frontend/src/lib/AGENTS.md`, but may warrant its own if the API client patterns are complex.

---

*This file is the contract for the Intent Layer phases ahead. No AGENTS.md files will be created until this plan is reviewed and accepted.*
