# Preview System Components

## Purpose
This directory owns the entire content-preview and draft UI: page orchestration,
the platform mockup system, slot assignment, draft management, and
platform/run/draft selectors. It does NOT own preview state persistence (in
`lib/stores/previewStore`), API calls for fetching runs or drafts (in
`lib/fastapi/workflows`), or the orchestration logic that ties them together
(in `hooks/usePreviewPage`).

## Architecture
`PreviewPage` is the root component. It delegates all data fetching and state
management to `usePreviewPage` (hook) and distributes context via
`PreviewDataContext`. Child components read from this context rather than
passing props through the tree.

Key sub-systems:
- `mockups/` — platform-specific rendering (LinkedIn, email, TikTok mockups).
  `MOCKUP_REGISTRY` maps `platformId` to a mockup component.
- `slots/` — individual slot sub-components that render assigned content.
- `previews/` — media preview sub-components (image, video).
- `PreviewDndContext` — wraps the DnD kit provider for drag-to-assign interactions.

Live mode and draft mode share the same `PreviewPage` component. `isDraftMode`
from `PreviewDataContext` is the gate that switches data sources.

## Contracts
- `PreviewContextId` follows the pattern `<base>::<outputKey>` for workflows
  with multiple output tabs. `"__live__"` is the sentinel value for the live run
  view (not a saved draft). Both values are strings — callers must not use
  `=== true` or falsy checks on context IDs.
- `PreviewNodeState { id, type, status, outputs }` is intentionally lighter than
  `WorkflowNodeState` from the workflow builder — it does not carry input state
  or error details. Do not expand it to match `WorkflowNodeState` without
  understanding why the shapes diverge.
- `MOCKUP_REGISTRY` in `mockups/index.ts` is the extension point for adding new
  platform mockups. New platforms also require entries in `PLATFORM_TEMPLATES`
  in `frontend/src/types/preview.ts`.
- `OutputsSidebar` exports a `useNodeOutputs` hook. This hook is local to the
  preview subsystem — it is not a general-purpose hook and should not be imported
  outside this directory.

## Pitfalls
- The slot system has three concepts that are easy to conflate: a `TemplateSlot`
  (a position in a platform mockup — defined in `types/preview.ts`), a
  `SlotAssignment` (a user's mapping of a node output to a slot — stored in
  `previewStore`), and the rendered content (resolved at render time from the
  assignment). Mixing these up produces UI that silently shows nothing.
- `PreviewDataContext` is provided by `PreviewPage` and is only available within
  that component tree. Components that try to consume `usePreviewDataContext()`
  outside a `PreviewPage` will throw.
- `DraftModeSidebar` and the live `OutputsSidebar` are mutually exclusive panels.
  The `isDraftMode` flag controls which is visible. They share slot-assignment
  UI code but operate on different data sources — changes to slot assignment UX
  must be applied in both.
- `usePreviewPage` returns a flat object with 30+ fields. This hook is the
  highest-complexity hook in the frontend. Avoid expanding its surface further —
  prefer splitting into sub-hooks if additional state is needed.
