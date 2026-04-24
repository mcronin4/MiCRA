# Workflow Node Components

## Purpose
This directory owns the 21 React components that render individual workflow node
cards in the canvas editor. Each component manages its own local form state and
syncs it to `workflowStore`. It does NOT execute nodes during workflow runs
(the backend executor owns that). It does NOT handle edge routing or node
deletion (those are in `CanvasPanel`).

## Architecture
All node components receive only `id: string` from React Flow's `NodeProps`.
All other state — inputs, outputs, status, errors — is read from `workflowStore`
via the node's `id`. No data flows through React Flow's `data` prop.

Shared structure:
- `WorkflowNodeWrapper` — chrome for all node types (handles, status badge,
  `ManualInputToggle`). Exports `nodeThemes` record keyed by node type.
- `BucketNodeBase` — shared base for the four bucket node types.
- `PresetManager` — CRUD UI for text-generation presets, used only within
  `TextGenerationNode`.
- `FilePickerModal` — R2 file browser, used in `TextBucketNode` and
  `VideoBucketNode`.

The "Test Node" button present on most nodes triggers a direct API call using
the node's current inputs. This is completely independent of the workflow
execution pipeline. Test results are stored in the node's state locally and do
not appear in workflow run outputs.

## Contracts
- Node state is always read from and written to `workflowStore.updateNode()`.
  Never pass state via React Flow's `data` prop — it will not persist and will
  not be included in workflow execution.
- `selected_file_ids` in node inputs is intentionally stripped by
  `workflowStore.exportWorkflowStructure()` (save-to-DB path) but retained by
  `exportWorkflowForExecution()` (run path). This is by design — file IDs are
  resolved at execution time, not stored in the workflow definition.
- `nodeThemes` from `WorkflowNodeWrapper` is the canonical color/icon mapping
  for all node types. Add entries here when adding a new node type.
- `DEFAULT_WORKFLOW_NODE_WIDTH` from `lib/workflowNodeSizing.ts` governs canvas
  layout calculations — changing it requires updating the layout algorithm.

## Pitfalls
- Adding a new node type requires: a new component here, an entry in the node
  registration table in `CanvasPanel`, an entry in `lib/nodeRegistry.ts`, and
  corresponding backend entries in `models/node_registry.py` and the executor's
  `@executor` registry. Missing any one of these produces silent failures.
- `TextGenerationNode` has a `PresetVariant = "summary" | "action_items" | null`
  local type that maps presets to UI variants. This is local to the component
  and has no backend equivalent — it is a frontend-only concept.
- `FilePickerModal` calls `lib/fastapi/files.listFiles()` which uses the
  10-minute in-memory cache in `api/v1/files.py`. Newly uploaded files may not
  appear immediately in the picker.
- `useWorkflowCopilot` and `useMicrAIBuildPlayback` hooks are consumed by
  components in the parent `workflow/` directory, not here. The node components
  themselves do not consume copilot or playback state.
