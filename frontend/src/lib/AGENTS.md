# Frontend Library — Utilities & Infrastructure

## Purpose
This directory owns the frontend's shared infrastructure: the API client layer,
state stores, client-side storage utilities, and shared utility modules
including the client-side node registry mirror. It does NOT own UI components,
application routing, or React contexts.

## Architecture
Three manual sync points with the backend live in this directory. The canonical
list and full blast-radius analysis lives at `backend/app/models/AGENTS.md`.
Frontend obligations: (1) `nodeRegistry.ts` must mirror `node_registry.py`
port schemas and node type keys; (2) `../types/blueprint.ts` must mirror
`blueprint.py`; (3) `stores/workflowStore.CONNECTED_INPUT_KEYS` must mirror
node port names. No code-gen enforces any of these — drift is silent.

`preview-utils.ts` is the only location of slot auto-assignment logic. It is
called from `stores/previewStore` (on config load) and from
`components/preview/OutputsSidebar`. Changes here affect both paths.

## Contracts
- `nodeRegistry.ts` exports `NODE_REGISTRY: Record<string, NodeTypeSpec>` and
  `getNodeSpec(type: string): NodeTypeSpec | undefined`. Node type key strings
  must exactly match those in `backend/app/models/node_registry.py`.
- `RuntimeType` is the cross-cutting discriminator for port compatibility, edge
  colors, and slot type matching. Its values must remain identical across
  `nodeRegistry.ts`, `types/blueprint.ts`, and all backend models.
- `workflowLayout.ts` is called by the copilot after patching the graph to
  produce a visually clean layout. It assumes the input graph is a valid DAG —
  cycles produce undefined layout behavior.

## Pitfalls
- `nodeRegistry.ts` is a mirror, not a source of truth. If you are tempted to
  add a new node type only here (e.g. for a frontend-only prototype), it will
  appear in the UI but fail silently when executed.
- `utils.ts` at this level exports the shadcn `cn()` helper. There is also a
  `utils/` subdirectory. Be precise about import paths — `@/lib/utils` vs
  `@/lib/utils/imageUtils` are different files.
- `workflowNodeSizing.ts` exports `DEFAULT_WORKFLOW_NODE_WIDTH`. This constant
  is used in the layout algorithm and in individual node component sizing.
  Changing it requires validating that canvas layout still works correctly.

## Downlinks
- [fastapi](./fastapi/AGENTS.md) — typed API client layer; SSE streaming bypass; shared `apiClient` singleton
- [stores](./stores/AGENTS.md) — three Zustand stores; dual export methods on workflowStore; manual localStorage in previewStore
