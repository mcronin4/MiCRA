# Data Models — Blueprint & Node Registry

## Purpose
This module owns the two shared schema definitions that form the vocabulary of
the entire Micra pipeline: the `Blueprint` execution graph and the
`NODE_REGISTRY` node-type catalog. It does NOT own Supabase table row models
(those are defined inline in `api/v1/` route files), workflow execution results
(in `services/workflow_executor.py`), or frontend type mirrors (in
`frontend/src/types/blueprint.ts` and `frontend/src/lib/nodeRegistry.ts`).

## Architecture
`blueprint.py` defines the intermediate representation produced by
`services/blueprint_compiler.py` and consumed by `services/workflow_executor.py`
and `services/workflow_copilot.py`. Blueprints are never persisted — they are
compiled fresh from the ReactFlow `{nodes, edges}` payload on every run.

`node_registry.py` defines `NODE_REGISTRY`, the source-of-truth catalog of all
node types. It is consumed by the compiler (for port schema validation), the
executor (for dispatch), the copilot (for planning), and the seed scripts in
`db/`.

Three manual sync points depend on this module staying in sync with the frontend:
- `backend/app/models/node_registry.py` ↔ `frontend/src/lib/nodeRegistry.ts`
- `backend/app/models/blueprint.py` ↔ `frontend/src/types/blueprint.ts`
- `NODE_REGISTRY` port schemas ↔ `workflowStore.CONNECTED_INPUT_KEYS`

There is no code-gen enforcing these. Drift is silent.

## Contracts
- `RuntimeType = Literal["Text", "ImageRef", "VideoRef", "AudioRef"]` — this
  type drives edge coloring, handle coloring, slot compatibility, and port
  validation across both stacks. Any change requires updating all three sync
  points above.
- `RuntimeShape = Literal["single", "list", "map"]` — shapes govern how the
  executor merges fan-in inputs.
- Blueprints are never persisted. The `Blueprint` object is transient; only the
  ReactFlow `{nodes, edges}` source is stored in `workflow_versions`.
- `Blueprint.engine_version = "1.0"` is hardcoded. The executor checks this on
  receipt.
- Adding a new node type requires: (1) an entry in `NODE_REGISTRY`, (2) a
  corresponding `@executor` function in `services/workflow_executor.py`, (3)
  updates to all three frontend sync points listed above.

## Pitfalls
- `TextGeneration.default_implementation = "fireworks:llama-v3p1"` is stale —
  actual text generation uses Gemini. The field is read by the workflow copilot
  for planning hints but has no effect at execution time. Do not change it to
  reflect Gemini without checking what the copilot does with it.
- The `NODE_REGISTRY` keys are the string values used by the ReactFlow editor to
  identify node types. These strings are stored in persisted workflow versions in
  the database. Renaming a key is a breaking change requiring a data migration.
