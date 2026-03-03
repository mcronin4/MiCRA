# NotebookLM System Design Flowchart Prompt (MiCRA)

## Purpose
This document provides a single copy-paste NotebookLM prompt that generates an executive, layered architecture flowchart set for MiCRA using the primary workflow platform path.

## Canonical Architecture Fact Sheet (Primary Path)
Use the following as ground-truth context for diagram generation.

### 1) Actors and trust boundaries
- End user interacts with the MiCRA web app.
- Frontend is a Next.js/React app (workflow builder, preview, auth UX).
- Backend is a FastAPI service exposing `/api/v1/*`.
- Auth and primary relational data are in Supabase with Row-Level Security (RLS).
- File objects are stored in Cloudflare R2 (S3-compatible), with metadata in Supabase.
- External AI services include Gemini, Fireworks, and Gradium Voice.

### 2) Frontend primary modules
- Auth/session:
  - Supabase client auth session handling.
  - Protected routes for authenticated UX.
- Workflow builder:
  - React Flow canvas for nodes/edges.
  - Save/load workflow structure.
  - Compile and execute requests.
  - Copilot planning requests (MicrAI).
- Runtime updates:
  - SSE streaming for workflow execution events.
  - Node status updates in UI from stream events.
- Preview and drafting:
  - Preview route loads run outputs.
  - Draft create/read/update/delete for platform mockups.

### 3) Backend primary modules
- API composition:
  - `app/main.py` boots FastAPI and includes `api/v1` routes.
  - `app/api/v1/workflows.py` handles workflow CRUD, compile, execute, SSE execute, copilot plan, run history, run outputs, preview drafts.
  - `app/api/v1/files.py` handles upload init/complete, signing, list, delete.
- Workflow compiler:
  - `app/services/blueprint_compiler.py`
  - Parses/normalizes graph, validates node connectivity/type compatibility, topological ordering, diagnostics.
- Workflow executor:
  - `app/services/workflow_executor.py`
  - Executes compiled DAG, supports parallel-ready nodes, streams SSE events:
    - `workflow_start`
    - `node_start`
    - `node_complete`
    - `node_error`
    - `workflow_complete`
    - `workflow_error`
  - Persists execution summary and optional run outputs.
- Copilot planner:
  - `app/services/workflow_copilot.py`
  - Plans graph from natural language with Gemini + deterministic fallback + compile/repair loop.

### 4) Core data model and storage
- Supabase tables used in primary path:
  - `workflows` (metadata)
  - `workflow_versions` (versioned graph payload)
  - `executions` (run logs/summaries)
  - `workflow_run_outputs` (optional persisted node/workflow outputs)
  - `files` (file metadata and ownership)
  - `text_generation_presets` (shared/user presets)
  - `preview_drafts` (preview assignment drafts)
- R2 bucket stores uploaded media and derived file objects (signed URL access patterns).

### 5) Security and data ownership
- Backend validates Supabase JWT via JWKS.
- Authenticated requests use user-scoped Supabase client so RLS policies enforce ownership.
- Service-role/admin-style client exists for privileged/system operations where required.
- Files, workflows, runs, and drafts are user-owned unless explicitly system-scoped templates.

### 6) Primary runtime flows
- Build/save flow:
  - User edits graph in builder.
  - Frontend saves workflow metadata + versioned graph via workflow APIs.
- Compile flow:
  - Frontend sends graph (or workflow ID) to compile endpoint.
  - Backend compiler returns success + diagnostics.
- Execute flow:
  - Frontend triggers execute (raw or saved workflow).
  - Backend compiles then runs DAG.
  - Frontend receives SSE events and updates node states live.
- Persistence flow:
  - Backend writes execution summary to `executions`.
  - If enabled/eligible, backend writes run outputs to `workflow_run_outputs`.
- Preview flow:
  - Frontend loads run list and selected run outputs.
  - User maps outputs to platform slots and saves drafts (`preview_drafts`).

### 7) Copilot planning flow
- User submits natural-language request from builder.
- Backend resolves text generation settings/presets.
- Planner attempts Gemini structured workflow plan.
- If Gemini plan is unavailable/invalid, fallback templates/edit heuristics are used.
- Planned graph is normalized/defaulted (labels, params, handle repairs, required input wiring).
- Graph is compiled.
- If invalid, auto-repair loop runs (up to configured attempts), then recompiles.
- On success, response includes:
  - final `workflow_data`
  - operation log (added/updated/removed nodes/edges)
  - touched node IDs
  - guided build steps and narrations

### 8) External integrations in primary path
- Gemini:
  - Copilot plan generation
  - Text preset/override selection helpers
  - Narration generation
  - Other generation/extraction tasks used by workflow nodes
- Fireworks:
  - Image-text matching VLM path
  - Audio transcription path
- Gradium Voice:
  - Voice services used by voice endpoints/UX
- Cloudflare R2:
  - File object storage and signed access

## Copy-Paste Master Prompt for NotebookLM
Use this prompt as-is in NotebookLM.

```text
You are a systems architect. Generate a clear executive architecture flowchart set from the provided MiCRA context.

Goal:
- Produce an executive, technically accurate, layered architecture visualization of MiCRA's primary workflow platform path.
- Focus on clarity for leadership/stakeholder review while preserving key engineering truth.

Scope constraints:
- Include only the primary workflow platform path.
- Keep legacy/secondary modules as short side-notes only; do not expand them into main flows.
- Do not invent components, tables, endpoints, or integrations not present in the context.

Required outputs:
1) Diagram A - Layered System Context
2) Diagram B - Runtime Flow (build -> compile -> execute -> SSE updates -> persistence -> preview)
3) Diagram C - Copilot Planning and Repair Subflow

Output format rules:
- Return Mermaid `flowchart` blocks for each diagram (one block per diagram).
- Add a short legend section explaining notation/boundary colors/shapes.
- Add 6-10 concise architectural takeaways.
- Add an "Assumptions and Open Questions" section (short, practical).
- Use executive-readable labels (not low-level function names unless necessary for clarity).

Fidelity and architecture rules:
- Preserve trust boundaries:
  - User/browser
  - Frontend app
  - Backend API/service layer
  - Data/storage systems
  - External AI providers
- Preserve data ownership and auth boundaries:
  - JWT validation boundary
  - RLS-enforced user-scoped data access
  - privileged/system access paths where relevant
- Show external service interactions (Gemini, Fireworks, Gradium, R2) only where they materially impact primary flows.
- Show one happy path and one error/repair branch in:
  - Runtime execution flow
  - Copilot planning flow
- Keep diagrams readable: avoid low-level clutter and avoid excessive edge crossings.

Use this architecture context as source of truth:

SYSTEM OVERVIEW
- MiCRA is a multimodal workflow platform for transforming source content into publishable outputs.
- Frontend: Next.js/React app with auth, workflow builder, execution monitoring, and preview/drafting UX.
- Backend: FastAPI service with workflow APIs, compiler, executor, and copilot planner.
- Data/auth: Supabase (JWT + RLS + relational tables).
- Object storage: Cloudflare R2.
- AI providers: Gemini, Fireworks, Gradium Voice.

PRIMARY FRONTEND MODULES
- Auth/session management with protected user routes.
- Workflow builder canvas (React Flow style graph editing).
- Workflow persistence, compile, execute, and copilot requests.
- SSE stream handling for live node/run status updates.
- Preview page loading run outputs and managing preview drafts.

PRIMARY BACKEND MODULES
- Workflow API endpoints for:
  - workflow CRUD/versioning
  - compile (raw and by workflow id)
  - execute (raw/by id + SSE streaming variants)
  - copilot planning
  - run history and persisted run outputs
  - preview draft CRUD
- Files API for upload init/complete, signed URLs, listing, deletion.
- Blueprint compiler service:
  - normalize + validate graph + diagnostics + execution ordering
- Workflow executor service:
  - compile-to-run DAG execution
  - parallel-ready node execution
  - SSE event emission (workflow/node lifecycle)
  - execution + output persistence
- Workflow copilot service:
  - NL request -> Gemini structured plan
  - deterministic fallback templates/edits
  - normalize/defaults
  - compile + auto-repair loop
  - return plan + operations + guided steps

DATA MODEL (PRIMARY TABLES)
- workflows
- workflow_versions
- executions
- workflow_run_outputs
- files
- text_generation_presets
- preview_drafts

SECURITY MODEL
- Backend validates Supabase JWT via JWKS.
- User-scoped Supabase client enforces RLS ownership boundaries.
- Service-role/admin access is limited to privileged/system operations.

PRIMARY RUNTIME FLOW DETAILS
- Build/Save:
  - User edits workflow graph and saves metadata + versioned graph.
- Compile:
  - Graph is compiled; validation diagnostics returned to UI.
- Execute:
  - User starts run; backend executes graph and streams SSE lifecycle events.
- Persist:
  - Run summary stored in executions.
  - Optional per-run outputs stored in workflow_run_outputs.
- Preview:
  - User opens preview, loads run outputs, assigns output content to platform slots, and stores drafts.

COPILOT FLOW DETAILS
- User sends natural-language workflow request.
- Service resolves text preset/settings context.
- Gemini structured planning attempt.
- If unavailable/invalid -> deterministic fallback planning.
- Normalize graph and apply defaults.
- Compile planned graph.
- If invalid -> auto-repair + recompile loop (bounded attempts).
- Return final workflow plan and guided operation metadata.

Now generate:
- Diagram A: layered architecture context
- Diagram B: runtime flow with one error branch
- Diagram C: copilot flow with fallback + repair loop
- Then legend, key takeaways, and assumptions/open questions.
```

## Acceptance Checklist
- Coverage: diagrams include frontend, backend APIs/services, data/auth/storage, and external AI providers.
- Runtime path: includes build -> compile -> execute -> SSE -> persistence -> preview.
- Copilot path: includes Gemini plan, fallback plan, compile/repair loop, and final plan outputs.
- Security/data ownership: JWT/RLS boundary and storage ownership are visible.
- Scope: primary path remains central; legacy/secondary detail is not expanded.

