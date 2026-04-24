# Boundary Manifest — Micra

> This is the Phase 2 output. It is the contract Phase 3 will execute against exactly.
> Conflict resolutions applied: C1 agents standalone, C2 quote_extraction in parent,
> C3 auth standalone, C4 db standalone, C5 hooks in consumer nodes,
> C6 test/script dirs as pitfalls in parents, C7 .claude/ standalone.

---

## Confirmed Node Locations

### .claude/
- **Boundary type:** INVARIANT
- **Key knowledge to capture:** The PostToolUse hook enforces a 300-line hard cap and `## Downlinks` requirement on every AGENTS.md write — an agent that doesn't know this will have its writes blocked silently. The hook script uses `python3` and `find` with Unix path assumptions, which behaves incorrectly on Windows (the repo's current environment). The `cartographer.md` agent is readonly and capped at 40 turns — it must not be used for write tasks. The SKILL.md in `skills/intent-layer/` is the canonical schema source cited by CLAUDE.md; deleting or renaming it breaks the Claude Code rules.
- **Depth priority:** WRITE FIRST

### backend/app/llm/
- **Boundary type:** CONTRACT + INVARIANT
- **Key knowledge to capture:** The `GeminiRotationManager` is a singleton shared across every Gemini-calling agent and service. Key rotation is per-model (not global) — cooldowns are tracked per `(key_slot, model)` pair, so calling a different model does not relieve a cooling key. Daily quota detection is heuristic string matching on `"perday"`, `"daily"`, `"rpd"` — this can miss novel quota error formats from the API. `query_gemini` silently strips markdown fences from structured output responses; callers should not pre-strip. The legacy `GEMINI_API_KEY` env var is supported as a single-key fallback — without numbered keys the rotation manager degrades to a single key with no rotation benefit.
- **Depth priority:** WRITE FIRST

### backend/app/models/
- **Boundary type:** CONTRACT + BLAST RADIUS
- **Key knowledge to capture:** `NODE_REGISTRY` and `Blueprint` are the shared vocabulary between frontend and backend — any change here has ripple effects in the compiler, executor, copilot, frontend node components, and stores. Blueprints are never persisted (by design); the executor receives a freshly compiled Blueprint on every run. `TextGeneration.default_implementation = "fireworks:llama-v3p1"` is stale — actual generation uses Gemini; this field is read by the copilot for planning hints but has no effect at execution time. `RuntimeType` is the cross-cutting type that drives edge coloring, handle coloring, slot compatibility, and port schemas — it must remain identical in `frontend/src/types/blueprint.ts`.
- **Depth priority:** WRITE FIRST

### backend/app/auth/
- **Boundary type:** BLAST RADIUS + CONTRACT
- **Key knowledge to capture:** Two dependency functions with distinct security semantics are frequently used together: `get_current_user` verifies the JWT and returns a `User`; `get_supabase_client` returns an RLS-constrained client but does NOT re-verify the token independently — it trusts Supabase RLS to enforce access. Several API routes (`image_matching`, `image_generation`, `video_generation`, `quote_extraction`, `trigger_job`) have no auth guard at all — this is intentional for current demo/testing but represents a known security gap. The JWKS client is pre-warmed at startup; if Supabase is unreachable at startup, the app will fail to start rather than degrading gracefully.
- **Depth priority:** WRITE FIRST

### backend/app/db/
- **Boundary type:** INVARIANT + BLAST RADIUS
- **Key knowledge to capture:** Two clients with fundamentally different RLS behavior: `get_supabase()` (admin singleton, service-role key, bypasses RLS — use for internal ops only, never for user-scoped queries) vs. `get_authenticated_supabase(token)` (per-request, anon key + user JWT, enforces RLS). Using the admin client where the authenticated client is required silently exposes other users' data. The seed scripts encode the canonical pre-built workflow templates — running them on a fresh Supabase instance is required for the app to function. `seed_linkedin_template.py` hardcodes a `preset_id` UUID that must match the target Supabase instance; it will silently reference the wrong or nonexistent preset on a different instance.
- **Depth priority:** WRITE FIRST

### backend/app/storage/
- **Boundary type:** CONTRACT + INVARIANT
- **Key knowledge to capture:** Two backends exist with an implicit interface: R2 (production, Cloudflare S3-compatible) and local artifacts (dev, activated by `ARTIFACT_BACKEND=local`). The `workflow_executor.py` bypasses `R2Client.sign_path()` and calls `r2.client.generate_presigned_url()` directly via `ThreadPoolExecutor` for parallelism — this is the only place the raw boto3 client is used directly, and it's intentional for performance. `R2_BUCKET = "micra"` is a hardcoded string constant imported and used elsewhere; changing the bucket name requires touching multiple files. The local artifact store writes to `.artifacts/` relative to the working directory unless `ARTIFACTS_DIR` is set — this path will be wrong if the process is started from outside `backend/`.
- **Depth priority:** WRITE FIRST

### backend/app/agents/image_extraction/
- **Boundary type:** INVARIANT + CONTRACT
- **Key knowledge to capture:** The pipeline switched from scene-detection to uniform sampling (recent commit) — `scene_detection.py` and the `generate_all_candidates`/`sample_timestamps` functions in `keyframe_pipeline.py` are still exported and callable but are not invoked by `run_keyframe_pipeline`. They are dead from the pipeline's perspective but alive as standalone utilities. The `detect_scenes` import from `scenedetect` is lazy — if `scenedetect` is not installed, calling `detect_scenes` will raise `ImportError` at runtime, not at import time. The `blur_threshold=30.0` default is intentionally low compared to the common recommendation of 100+ — this was a deliberate calibration for video frame content. The Haar cascade XML paths depend on OpenCV's data directory in the installed environment; tests that mock `cv2` must also mock the cascade classifier path.
- **Depth priority:** WRITE FIRST

### backend/app/agents/image_text_matching/
- **Boundary type:** CONTRACT + INVARIANT
- **Key knowledge to capture:** This is the only agent that uses Fireworks AI (Qwen 2.5 VL), not Gemini. It requires `FIREWORK_API_KEY` (no default; `None` causes silent API failures, not an early error). `ImageTextMatcherVLM` must be used as an async context manager (`async with`) — constructing it without the context manager will not initialize the client. Despite the `async def` signature, API calls are synchronous and blocking — this will block the event loop if called from within an async executor. `timestamp_score` in `ImageMatch` is always `0.0` — the weight config comments this out explicitly; do not rely on it or attempt to activate it without implementing the scoring logic first.
- **Depth priority:** WRITE FIRST

### backend/app/agents/text_generation/
- **Boundary type:** RESPONSIBILITY SHIFT + CONTRACT
- **Key knowledge to capture:** Two parallel architectures coexist: the preset-driven `generator.py` (fetches prompt templates from Supabase, returns structured dicts) and four standalone hardcoded generators (return raw strings). The API route for text generation calls the preset path; the `hitl.py` route calls the standalone generators — these are different contracts for different callers. `content_parser.py` functions (`parse_email_content`, `parse_linkedin_content`, `parse_tiktok_content`) have no internal callers — they are utilities that external callers must invoke manually after receiving raw output. `parse_tiktok_content` hardcodes `@micra_official` and `Original Sound - MiCRA` as placeholder values — callers treating these as real data will produce incorrect output. In `generator.py` the template placeholder priority is `{source_context}` > `{input_text}` > prepend-to-prompt — this order is not enforced by types.
- **Depth priority:** WRITE FIRST

### backend/app/agents/video_generation/
- **Boundary type:** CONTRACT + BLAST RADIUS + INVARIANT
- **Key knowledge to capture:** The `VEO_ENABLE_LIVE_CALLS=true` env var is a kill switch — every call raises `RuntimeError` without it. This is intentional for CI/staging but means missing this var silently breaks all video generation without a clear error to new contributors. Two auth modes: Vertex AI (when `GOOGLE_APPLICATION_CREDENTIALS` is set) and Gemini API key rotation (fallback). The default GCP project `"core-avenue-488216-t2"` is hardcoded — if `GOOGLE_CLOUD_PROJECT` is not set in a Vertex AI environment, requests will hit the real production project. Reference images force `duration_seconds="8"` regardless of the requested value (Veo 3.1 constraint) — passing a different duration with images silently overrides the user's request. The polling loop uses `time.sleep` (blocking) — do not call `generate_video_with_veo` from an async context without wrapping it in `asyncio.run_in_executor`.
- **Depth priority:** WRITE FIRST

### backend/app/agents/
- **Boundary type:** CONTRACT + INVARIANT
- **Key knowledge to capture:** There is no shared base class, no Pydantic input/output schema, and no shared agent interface — each agent is completely standalone. This is a deliberate design choice, not an oversight. All agents except `image_text_matching` route through `backend/app/llm/gemini.py`; `image_text_matching` uses Fireworks AI; `image_extraction` makes no LLM calls at all. Async consistency is not enforced — several agents declare `async def` entry points but make synchronous blocking LLM calls inside; callers must not assume true async I/O. The `transcription/` subdirectory exists on disk but is empty — transcription logic lives entirely in `backend/audio_transcription/`, which is outside the `app/` package and imported via `sys.path` manipulation.
- **Depth priority:** WRITE SECOND

### backend/app/services/
- **Boundary type:** RESPONSIBILITY SHIFT + BLAST RADIUS
- **Key knowledge to capture:** The executor's `@executor` decorator is the registration mechanism for all node type handlers — adding a new node type requires both a `NODE_REGISTRY` entry in `models/` and a corresponding `@executor` function in `workflow_executor.py`. The compiler output (a `Blueprint`) is never the same object as the persisted workflow structure — the frontend sends ReactFlow `{nodes, edges}`, the compiler produces a `Blueprint`, and the executor runs that `Blueprint`; none of these are the same format. The copilot auto-repair loop makes up to 2 LLM attempts before falling back to a deterministic template — if both LLM attempts fail, the fallback may produce a generic or incorrect workflow silently. The Gradium voice service (`gradium_voice.py`) is the only service here that is NOT involved in the workflow execution pipeline; it is a separate bridge for STT/TTS and could be extracted independently.
- **Depth priority:** WRITE FIRST

### backend/app/api/
- **Boundary type:** CONTRACT + BLAST RADIUS
- **Key knowledge to capture:** Auth is inconsistently applied — five endpoints (`image_matching`, `image_generation`, `video_generation`, `quote_extraction`, `trigger_job`) have no `get_current_user` dependency. This is a known gap, not an accident. The `hitl.py` and `trigger_job.py` routes are legacy and largely superseded by the workflow execution engine — new callers should use `POST /api/v1/workflows/{id}/execute` instead. SSE streaming in `workflows.py` uses `StreamingResponse` with `text/event-stream`; the frontend reads this via a raw `fetch` + `ReadableStream` manually (not `EventSource`). The in-memory file list cache (10-min TTL) in `files.py` is per-process — in a multi-replica deployment, cache invalidation on mutation only affects the local replica.
- **Depth priority:** WRITE FIRST

### backend/audio_transcription/
- **Boundary type:** INVARIANT + CONTRACT
- **Key knowledge to capture:** This module lives outside the `app/` package at `backend/audio_transcription/`. It is imported in two ways: via `sys.path` manipulation in `api/v1/transcription.py` (which appends the `backend/` directory to `sys.path`), and by bare module path in `workflow_executor.py`. Standard Python tooling (linters, type checkers, `__init__.py`-based imports) will not resolve this module without the `sys.path` hack. `yt-dlp` is an optional dependency gated by `YT_DLP_AVAILABLE` — URL-based transcription will silently fail if yt-dlp is not installed rather than raising an import error at startup. Both `audio_transcription` and `image_text_matching` share the `FIREWORK_API_KEY` env var — they are independent consumers of different Fireworks endpoints (audio vs. vision).
- **Depth priority:** WRITE FIRST

### frontend/src/components/workflow/nodes/
- **Boundary type:** CONTRACT + INVARIANT
- **Key knowledge to capture:** All 21 node components read their state exclusively from `workflowStore` via node `id` — the `NodeProps` from React Flow are used only for the `id`; no data flows through React Flow's node `data` prop. The "Test Node" button triggers a direct API call with the node's current inputs, completely independent of the workflow execution pipeline — test results are stored locally in the node's state and do not affect the run-mode output. `BucketNodeBase` is the shared chrome for all four bucket types; changes to its layout affect all buckets. `FilePickerModal` inside `TextBucketNode` and `VideoBucketNode` is the only place `lib/fastapi/files` listing is called from a node component — file selection state is stored as `selected_file_ids` in node inputs, and this field is intentionally stripped by `exportWorkflowStructure` but retained by `exportWorkflowForExecution`.
- **Depth priority:** WRITE FIRST

### frontend/src/components/workflow/
- **Boundary type:** RESPONSIBILITY SHIFT + INVARIANT
- **Key knowledge to capture:** `setNodesRef` and `setEdgesRef` are `MutableRefObject<Dispatch>` passed from `WorkflowBuilder` into `CanvasPanel` to escape React's stale-closure problem across the React Flow / Zustand boundary — this is the primary mechanism for external code to mutate canvas state. The node registration table in `CanvasPanel` maps string `NodeType` keys to React components; unregistered types render `UnknownNode`. `ReactFlowWrapper` is lazy-loaded to avoid SSR issues with React Flow's browser-only APIs. The `NEXT_PUBLIC_MICRAI_GUIDED_BUILD_ENABLED` env flag controls the entire MicrAI copilot dock and guided-build overlay — it is a compile-time flag baked into the bundle.
- **Depth priority:** WRITE SECOND

### frontend/src/components/preview/
- **Boundary type:** RESPONSIBILITY SHIFT + CONTRACT
- **Key knowledge to capture:** `PreviewContextId` follows the pattern `<base>::<outputKey>` for multi-output-tab support — `__live__` is the sentinel for the live run view (not a saved draft). The slot system distinguishes three concepts that are easy to conflate: a `TemplateSlot` (a position in a platform mockup), a `SlotAssignment` (a user's mapping of a node output to a slot), and the actual rendered content (resolved at render time from `previewStore`). `OutputsSidebar` exports a `useNodeOutputs` hook used only within this subsystem — it is not a general-purpose hook. Draft mode and live mode share the same `PreviewPage` component but operate on different data sources; `isDraftMode` from `PreviewDataContext` is the gate.
- **Depth priority:** WRITE FIRST

### frontend/src/lib/fastapi/
- **Boundary type:** CONTRACT + INVARIANT
- **Key knowledge to capture:** All modules import and share a single `apiClient` singleton from `client.ts` — this singleton caches the Supabase session for 30 seconds and GET responses for 10 seconds (max 50 entries LRU). Errors are normalized to `HttpError` but this class is not exported — callers must detect it via `'status' in err` or `instanceof HttpError` won't work across module boundaries. The SSE streaming in `workflows.ts` uses raw `fetch` + `ReadableStream` instead of `EventSource` because `EventSource` cannot send custom headers — in local dev, the stream bypasses the Next.js `/backend` rewrite and hits `http://127.0.0.1:8000/api` directly (hardcoded), which will break if the backend runs on a different host or port.
- **Depth priority:** WRITE FIRST

### frontend/src/lib/stores/
- **Boundary type:** INVARIANT + CONTRACT
- **Key knowledge to capture:** `workflowStore` has two export methods with subtly different semantics: `exportWorkflowStructure` (strips `selected_file_ids` — for saving to the DB) and `exportWorkflowForExecution` (retains them — for sending to the executor). Using the wrong one silently produces workflows that either lose file references or save them to the DB unnecessarily. `previewStore` manages its localStorage manually (not via zustand/persist middleware) and performs context-ID migration on load — if the migration logic is changed, existing user data in localStorage may be misread. `CONNECTED_INPUT_KEYS` in `workflowStore` must be manually kept in sync with the backend `NODE_REGISTRY` — there is no code-gen or type-enforcement between them. `toastStore`'s `showToast()` is deliberately callable outside React (it uses the zustand store API directly); this pattern is intentional for use in non-component contexts like API error handlers.
- **Depth priority:** WRITE FIRST

### frontend/src/lib/
- **Boundary type:** CONTRACT + INVARIANT
- **Key knowledge to capture:** `nodeRegistry.ts` is a client-side mirror of `backend/app/models/node_registry.py` — these two files must be manually kept in sync; there is no code-gen or shared schema enforcement. Similarly, `frontend/src/types/blueprint.ts` mirrors `backend/app/models/blueprint.py`. And `workflowStore`'s `CONNECTED_INPUT_KEYS` mirrors the node registry. These three sync points are the primary source of silent breakage when node types are added or modified. `preview-utils.ts` is the only place slot auto-assignment logic lives — it is called both from `previewStore` (on load) and from `OutputsSidebar` — changes here affect both paths.
- **Depth priority:** WRITE SECOND

### backend/
- **Boundary type:** RESPONSIBILITY SHIFT
- **Key knowledge to capture:** The backend requires Python ≥ 3.13 (strict). The project uses `uv` for dependency management (`pyproject.toml` + `uv.lock`) but the README instructs `pip install -r requirements.txt` — a potentially divergent manually-maintained file. `pytest-asyncio` appears in runtime dependencies instead of dev dependencies (misplacement in `pyproject.toml`). The `backend/audio_transcription/` module lives outside the `app/` package by design — it predates the FastAPI app structure and is imported via `sys.path` manipulation. Two distinct Fireworks AI credentials may be needed: `FIREWORK_API_KEY` for both transcription (Whisper) and image-text-matching (Qwen VLM) — these share the same env var.
- **Depth priority:** WRITE LAST

### frontend/
- **Boundary type:** RESPONSIBILITY SHIFT
- **Key knowledge to capture:** The Next.js middleware (`middleware.ts`) matches all routes but is effectively a pass-through — it does NOT enforce authentication. Auth protection is entirely client-side via `ProtectedRoute`. The `/backend/:path*` → `BACKEND_URL/api/:path*` rewrite in `next.config.ts` has a `proxyTimeout` of 300 seconds to accommodate long-running AI calls — reducing this will silently break video generation. The `prelint` script (`checkMicraiThinkingFrames.mjs`) validates robot animation frame assets before every `npm run lint` run — all 6 PNG files must be updated atomically when the robot animation changes, or linting will be blocked. `playwright.config.ts` uses `pnpm dev` while `package.json` scripts use `npm` — E2E tests must be invoked via the `pnpm` commands or the dev server will not start. No `tsc --noEmit` runs on pre-commit — type errors can pass through lint-staged undetected.
- **Depth priority:** WRITE LAST

### / (repo root)
- **Boundary type:** RESPONSIBILITY SHIFT + CONTRACT
- **Key knowledge to capture:** This is a two-stack monorepo (Python/FastAPI backend, Next.js frontend) with no monorepo tooling (the root `package-lock.json` is vestigial and empty). The three manual sync points that span both stacks are the highest-blast-radius locations in the repo: (1) `backend/app/models/node_registry.py` ↔ `frontend/src/lib/nodeRegistry.ts`, (2) `backend/app/models/blueprint.py` ↔ `frontend/src/types/blueprint.ts`, (3) `backend/app/models/node_registry.py` ↔ `workflowStore.CONNECTED_INPUT_KEYS`. Auth spans both stacks: Supabase issues JWTs consumed by both `backend/app/auth/dependencies.py` (RS256/ES256 JWKS verification) and `frontend/src/lib/supabase/client.ts` (browser session). The `CLAUDE.md` rules at root apply to all agents in this repo — reading it is mandatory before touching any file.
- **Depth priority:** WRITE LAST

---

## Rejected Locations

### backend/app/main.py
- **Reason rejected:** CONTENT VISIBLE IN CODE — pure wiring (CORS config, router mount, singleton warm-up). No hidden contracts.

### backend/app/quality/
- **Reason rejected:** CONTENT VISIBLE IN CODE — confirmed empty (`__init__.py` only). No contracts to surface.

### backend/app/agents/transcription/
- **Reason rejected:** CONTENT VISIBLE IN CODE — empty directory (`__pycache__` only). Ghost directory.

### backend/app/agents/summarization/
- **Reason rejected:** COVERED BY PARENT — 1 file, 1 function, 1 prompt. The missing `__init__.py` pitfall belongs in `backend/app/agents/AGENTS.md`.

### backend/app/agents/image_generation/
- **Reason rejected:** COVERED BY PARENT — 1 file, 2 thin wrappers. Hardcoded MIME type and duplicated model name pitfalls belong in `backend/app/agents/AGENTS.md`.

### backend/app/agents/quote_extraction/
- **Reason rejected:** COVERED BY PARENT (user decision C2) — filtering logic density alone is not a semantic boundary. The multi-layer fallback and verbatim-check behavior will be documented in `backend/app/agents/AGENTS.md`.

### backend/migrations/
- **Reason rejected:** CONTENT VISIBLE IN CODE — raw SQL with no runtime logic. Schema facts belong as Contracts entries in `backend/app/db/AGENTS.md`.

### backend/outputs/
- **Reason rejected:** ORGANIZATIONAL ONLY — generated artifacts directory.

### backend/scripts/
- **Reason rejected:** COVERED BY PARENT — dev tooling documented as Pitfalls in `backend/AGENTS.md`.

### backend/tests/
- **Reason rejected:** COVERED BY PARENT (user decision C6) — test conventions as Pitfalls in `backend/AGENTS.md`.

### docs/
- **Reason rejected:** ORGANIZATIONAL ONLY — single NotebookLM prompt file, not a semantic boundary.

### .github/
- **Reason rejected:** ORGANIZATIONAL ONLY — single CODEOWNERS file, no agent-relevant contracts beyond required reviewers.

### frontend/src/app/
- **Reason rejected:** CONTENT VISIBLE IN CODE — pure routing shells delegating to components. All route shapes visible in directory structure.

### frontend/src/components/dashboard/
- **Reason rejected:** COVERED BY PARENT — standard CRUD dashboard, no non-obvious invariants.

### frontend/src/components/ui/
- **Reason rejected:** CONTENT VISIBLE IN CODE — pure UI primitives, all behavior visible in code.

### frontend/src/components/auth/
- **Reason rejected:** CONTENT VISIBLE IN CODE — standard auth forms, OTP/OAuth pattern fully visible.

### frontend/src/components/ (top-level: AuthNav, HitlReview, LogoutButton, ProtectedRoute, ZoomControls)
- **Reason rejected:** COVERED BY PARENT — small utility components; dead ones (`HitlReview`, `ZoomControls`) noted as Pitfalls in `frontend/src/components/workflow/AGENTS.md`.

### frontend/src/hooks/
- **Reason rejected:** COVERED BY PARENT (user decision C5) — hooks don't own behavior, they enable it. Each significant hook documented in the component node that primarily consumes it.

### frontend/src/contexts/
- **Reason rejected:** COVERED BY PARENT — thin auth context, standard Supabase integration. Covered in `frontend/AGENTS.md`.

### frontend/src/lib/supabase/
- **Reason rejected:** CONTENT VISIBLE IN CODE — single-file client init, no hidden contracts.

### frontend/src/lib/storage/
- **Reason rejected:** CONTENT VISIBLE IN CODE — low-level upload utilities, no domain invariants.

### frontend/src/types/
- **Reason rejected:** CONTENT VISIBLE IN CODE — type declarations; contracts visible in the types themselves.

### frontend/e2e/
- **Reason rejected:** COVERED BY PARENT (user decision C6) — credential requirements and selector contracts documented as Pitfalls in `frontend/AGENTS.md`.

### frontend/tests/
- **Reason rejected:** COVERED BY PARENT (user decision C6) — test conventions as Pitfalls in `frontend/AGENTS.md`.

### frontend/scripts/
- **Reason rejected:** COVERED BY PARENT (user decision C6) — prelint asset constraint documented as Pitfall in `frontend/AGENTS.md`.

### frontend/public/
- **Reason rejected:** ORGANIZATIONAL ONLY — static assets; the robot animation atomicity constraint is documented as a Pitfall in `frontend/AGENTS.md`.

---

## Least Common Ancestor Decisions

### Knowledge: Gemini API key rotation mechanism
- **Lives at:** `backend/app/llm/`
- **Reason:** Every Gemini-calling agent imports from this module. Documenting rotation semantics in each agent would duplicate it 8 times. This is the shallowest node that is the direct owner of the mechanism.

### Knowledge: Absence of a shared agent input/output contract
- **Lives at:** `backend/app/agents/`
- **Reason:** This is an architectural fact about the agent layer as a whole. It applies equally to all 9 agent subdirectories. Documenting it in services would be wrong — services are consumers, not the source of this design decision.

### Knowledge: Fireworks AI credential (FIREWORK_API_KEY) used by two independent consumers
- **Lives at:** `backend/app/agents/`
- **Reason:** `image_text_matching` (Qwen VLM) and `audio_transcription` (Whisper) both read `FIREWORK_API_KEY` independently. The shallowest node that covers both is `backend/app/agents/` (audio_transcription is documented there via its own node's Downlink, but the shared-credential fact lives here so it isn't repeated in both leaf nodes).

### Knowledge: Blueprint/node registry vocabulary (RuntimeType, RuntimeShape, NODE_REGISTRY)
- **Lives at:** `backend/app/models/`
- **Reason:** This is the authoritative definition. Compiler, executor, copilot, and frontend all consume it. Any documentation belongs at the source, with consumers citing it by Downlink reference.

### Knowledge: Three manual frontend/backend sync points (node registry, blueprint types, CONNECTED_INPUT_KEYS)
- **Lives at:** `/` (repo root)
- **Reason:** These sync points span both stacks. No single backend or frontend node covers all three. The root is the only node that sits above both `backend/` and `frontend/` and can own this cross-stack invariant.

### Knowledge: Supabase auth — JWT issuance, JWKS verification, RLS enforcement, browser session
- **Lives at:** `/` (repo root) for the overall auth topology; `backend/app/auth/` for server-side verification details; `frontend/` (in the node) for client-side session details
- **Reason:** Auth spans both stacks. The root node describes the full picture (Supabase issues, backend verifies via JWKS, frontend holds via browser session, RLS enforces at DB). Stack-specific details live in their respective stack nodes.

### Knowledge: Workflow execution model (Blueprint lifecycle: ReactFlow → compile → execute → SSE stream)
- **Lives at:** `backend/app/services/`
- **Reason:** The compiler and executor both live here. This is where the full Blueprint lifecycle is owned. Frontend consumers (hooks, lib/fastapi) are documented as consumers in their own nodes.

### Knowledge: Storage backend selection (R2 vs local, artifact URL patterns)
- **Lives at:** `backend/app/storage/`
- **Reason:** Both backends are owned by this module. Agents and routes that produce artifacts link here rather than re-explaining the selection logic.

### Knowledge: Content type taxonomy (LinkedIn, email, TikTok, chatbot, their field requirements)
- **Lives at:** `backend/app/agents/text_generation/`
- **Reason:** The canonical definitions of per-platform content shape live in the generators and parser here. Frontend platform selectors and preview mockups are consumers that should link here.

### Knowledge: SSE streaming execution protocol (event shape, StreamingExecutionEvent union)
- **Lives at:** `frontend/src/lib/fastapi/`
- **Reason:** This is where the protocol is decoded. The backend sends raw text/event-stream — the typed discriminated union is defined and enforced on the client side. Documents in the producer (`backend/app/api/`) should note it streams; the consumer node owns the shape contract.

---

## Writing Order (Phase 3 Sequence)

**Batch 1 — WRITE FIRST (leaves, write in any order within batch):**
1. `.claude/`
2. `backend/app/llm/`
3. `backend/app/models/`
4. `backend/app/auth/`
5. `backend/app/db/`
6. `backend/app/storage/`
7. `backend/app/agents/image_extraction/`
8. `backend/app/agents/image_text_matching/`
9. `backend/app/agents/text_generation/`
10. `backend/app/agents/video_generation/`
11. `backend/app/services/`
12. `backend/app/api/`
13. `backend/audio_transcription/`
14. `frontend/src/components/workflow/nodes/`
15. `frontend/src/components/preview/`
16. `frontend/src/lib/fastapi/`
17. `frontend/src/lib/stores/`

**Batch 2 — WRITE SECOND (mid-level, after their children are written):**
18. `backend/app/agents/`
19. `frontend/src/components/workflow/`
20. `frontend/src/lib/`

**Batch 3 — WRITE LAST (roots, after all descendants are written):**
21. `backend/`
22. `frontend/`
23. `/` (repo root)

**Total: 23 AGENTS.md files.**
