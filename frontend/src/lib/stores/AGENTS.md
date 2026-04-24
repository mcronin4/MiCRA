# State Stores — Zustand

## Purpose
This directory owns the three Zustand stores that form the frontend's shared
state layer: `workflowStore` (canvas and workflow state), `previewStore`
(preview configuration and slot assignments), and `toastStore` (notification
state). It does NOT own UI rendering or API calls — stores are pure state with
actions.

## Architecture
`workflowStore` persists to `localStorage` under key `"micra-workflow"` via
zustand's `persist` middleware. Outputs and node status are excluded from
persistence — nodes are restored to `idle` status on hydration.

`previewStore` manages its own `localStorage` reads and writes manually (no
`persist` middleware). It performs context-ID format migration on load to handle
legacy data.

`toastStore` is in-memory only. Its `showToast()` function is designed to be
called outside React (e.g. from API error handlers in `lib/fastapi/`) using the
zustand store API directly.

## Contracts
- `workflowStore.exportWorkflowStructure()` — strips `selected_file_ids` from
  node inputs. Use this when saving a workflow to the database.
- `workflowStore.exportWorkflowForExecution()` — retains `selected_file_ids`.
  Use this when sending a workflow to the executor. Using the wrong one silently
  produces broken workflow runs or unnecessary data in saved versions.
- `CONNECTED_INPUT_KEYS` in `workflowStore` maps node type strings to the input
  keys that represent incoming edge connections. This must be manually kept in
  sync with `backend/app/models/node_registry.py`. Drift produces silent
  connection failures in the canvas.
- `NodeStatus = 'idle' | 'pending' | 'running' | 'completed' | 'error'` — this
  union is used across node components, execution hooks, and preview components.
  Adding a new status requires updating all consumers.
- `PreviewContextId` format: `<base>::<outputKey>`. The sentinel `"__live__"` is
  the live run context. Context IDs from older sessions may use a legacy format;
  `previewStore` migrates them silently on load.

## Pitfalls
- `previewStore`'s manual `localStorage` management means that changes to the
  stored data shape require explicit migration logic in the `loadPreviewConfig`
  action. Without migration, old data produces silent runtime errors when
  destructured against the new shape.
- `workflowStore` persistence excludes `outputs` and `status` — this is
  intentional. After a page reload, nodes appear as `idle` even if a run
  completed before reload. Do not add `outputs` to the persist config without
  understanding the stale-output implications.
- `toastStore.showToast()` is called from both React components and non-React
  contexts (API error handlers). If you add side effects that depend on React
  lifecycle (e.g. `useEffect`) to toast display logic, you will break the
  non-React call sites.
- `importWorkflowStructure()` calls `sanitizeWorkflowEdgesAgainstRegistry()`
  before restoring edges. This silently drops any edge whose source or target
  node type is absent from `nodeRegistry.ts`. After a node type rename, old
  saved workflows will silently lose those connections on next load.
- The default platform in `previewStore` is `"linkedin"`. This default is
  hardcoded in the store initializer. If the platform list changes, verify this
  default still has a matching entry in `PLATFORM_TEMPLATES`.
