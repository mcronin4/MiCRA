# Services — Workflow Orchestration

## Purpose
This module owns the four orchestration services that wire the rest of the
backend together: the workflow executor (runs agent graphs), the blueprint
compiler (validates and transforms ReactFlow data), the workflow copilot
(NL-to-workflow planner), and the Gradium voice bridge (STT/TTS). It does NOT
implement any agent logic — it dispatches to `app/agents/` and
`audio_transcription/`. It does NOT persist blueprints.

## Architecture
**Blueprint lifecycle**: The frontend sends ReactFlow `{nodes, edges}` →
`blueprint_compiler.py` parses, validates against `models/node_registry.py`,
toposorts, and produces a `Blueprint` → `workflow_executor.py` runs that
`Blueprint` as a parallel async DAG.

The executor uses an `@executor` decorator to register handler functions per
node type. All node type handlers live in `workflow_executor.py`. Adding a new
node type requires both a `NODE_REGISTRY` entry in `models/` and a new
`@executor` function here.

SSE streaming: `execute_workflow_streaming` yields JSON-encoded
`StreamingExecutionEvent` strings consumed by `api/v1/workflows.py` via
`StreamingResponse`.

`gradium_voice.py` is independent of the workflow pipeline — it is a standalone
STT/TTS bridge and could be extracted without affecting workflow execution.

## Contracts
- `compile_workflow(nodes, edges, *, workflow_id, version, name, description,
  created_by) -> CompilationResult` — returned `Blueprint` is transient, never
  persisted. Check `result.diagnostics` before using `result.blueprint`.
- `execute_workflow(blueprint) -> WorkflowExecutionResult` — synchronous, returns
  a dict. Use this in scripts and tests.
- `execute_workflow_streaming(blueprint) -> AsyncGenerator[str]` — async, yields
  SSE JSON strings. Use this for API streaming responses.
- `execute_workflow_streaming(blueprint) -> AsyncGenerator[str]` — yields
  newline-terminated JSON strings. Event shape: `StreamingExecutionEvent`
  discriminated union defined in `frontend/src/lib/fastapi/workflows.ts`.
- Copilot auto-repair: up to 2 LLM retry attempts, then falls back to a
  deterministic template. A fallback workflow may be generic or incorrect — the
  caller receives no signal that fallback was triggered.
- Gradium env vars: `GRADIUM_API_KEY`, `GRADIUM_STT_WS_URL`, `GRADIUM_TTS_URL`,
  `GRADIUM_TTS_VOICE_ID` (default `YTpq7expH9539ERJ`).
- Copilot model tiers: `gemini-2.5-flash` (default) / `gemini-2.5-pro` (pro).

## Pitfalls
- The copilot auto-repair fallback produces a workflow silently — callers cannot
  distinguish a successfully planned workflow from a fallback template without
  inspecting the returned diagnostics. Always surface compilation diagnostics to
  the user.
- The executor bypasses `R2Client.sign_path()` for parallel URL signing via
  `ThreadPoolExecutor`. See `storage/AGENTS.md` for why this bypass exists.
- The executor imports every agent module at the top of the file. Import errors
  in any agent (e.g. missing optional dependency) will prevent the entire
  executor from loading.
- `audio_transcription` is imported via `sys.path` — see
  `audio_transcription/AGENTS.md` for the full import-hack context.
