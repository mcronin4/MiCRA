# Workflow Builder Components

## Purpose
This directory owns the entire workflow builder UI surface: canvas layout,
React Flow integration, node registration, the MicrAI copilot dock and
guided-build overlay, the execution toolbar, save/load/version dialogs, context
menus, and the image bucket panel. It does NOT own individual node card
rendering (in `nodes/`), persistent store state (in `lib/stores/workflowStore`),
or API calls (in `lib/fastapi/`).

## Architecture
`WorkflowBuilder` is the root component. It holds the top-level layout and
passes `setNodesRef` / `setEdgesRef` down to `CanvasPanel`. These refs are
`MutableRefObject<Dispatch>` — they exist to escape React's stale-closure
problem across the React Flow / Zustand boundary, allowing external code (copilot
patch application, undo/redo) to mutate canvas state after the initial render.

`ReactFlowWrapper` is lazy-loaded (`React.lazy`) to prevent SSR failures from
React Flow's browser-only DOM APIs.

`CanvasPanel` owns the node type registration table — a plain object mapping
string `NodeType` keys to React components. `__unknown__` is the fallback for
unregistered types. Edge colors are derived at render time from `RuntimeType`
values looked up in `lib/nodeRegistry.ts`.

Hooks consumed here (not in `nodes/`): `useWorkflowCopilot`,
`useMicrAIBuildPlayback`, `useMicrAIVoiceInput`, `useCanvasOperations`,
`useContextMenus`, `useWorkflowPersistence`, `useWorkflowExecution`,
`useBlueprintCompile`.

## Contracts
- `WorkflowBuilderProps { autoLoadWorkflowId?: string | null; onAutoLoadComplete?: () => void }` — the auto-load mechanism is triggered by the `?loadWorkflow=<id>` query param in `app/workflow/page.tsx`.
- `NEXT_PUBLIC_MICRAI_GUIDED_BUILD_ENABLED` is a compile-time env flag. Setting
  it to `false` removes the entire MicrAI copilot dock and guided-build overlay
  from the bundle. It is not a runtime toggle.
- The node registration table in `CanvasPanel` must be updated in sync with
  `lib/nodeRegistry.ts` and `backend/app/models/node_registry.py` when adding
  a node type.

## Pitfalls
- `setNodesRef` and `setEdgesRef` are refs, not state setters. Writing to them
  does not trigger a React re-render — they are used specifically because they
  bypass the render cycle. Do not use them in places where you need a re-render.
- `HitlReview` and `ZoomControls` in the parent `components/` directory are
  dead code — they have no callers. The HITL flow was superseded by the workflow
  execution pipeline; canvas zoom was moved into `ExecutionBar`.
- `WorkflowManager` (save/load dialog) and `WorkflowBuilder` share workflow
  metadata state via `workflowStore` — they do not communicate via props. Changes
  to save/load behavior must account for both components reading the same store
  simultaneously.
- React Flow requires a fixed-height parent container — the canvas will collapse
  to zero height if the parent has `height: auto`. This is a React Flow
  constraint, not a bug.

## Downlinks
- [nodes](./nodes/AGENTS.md) — 21 node-type components; all state via `workflowStore`; test-mode execution independent of workflow runs
