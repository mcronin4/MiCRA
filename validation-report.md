# Validation Report — Intent Layer Audit

## Nodes with Dead Weight

### backend/app/agents/AGENTS.md
- Issue: The LLM routing table in Architecture contains a literal artifact from
  drafting: `"image_extraction` (no LLM), wait — actually"`. This correction-in-progress
  made it into the published text and makes the routing table incoherent. Must be
  fixed — it reads as a mistake to any agent loading this node.

### backend/app/auth/AGENTS.md
- Issue: `JWKS URL: {SUPABASE_URL}/auth/v1/.well-known/jwks.json` is visible in
  the code in 5 seconds. The URL format itself adds no institutional knowledge.
  The consequential fact (key rotation causes an outage) is already in the
  Pitfalls bullet below it. Trim the raw URL contract line.

---

## Nodes with Duplication

### The three manual frontend/backend sync points
- Found in: `AGENTS.md` (root), `backend/app/models/AGENTS.md`,
  `frontend/src/lib/AGENTS.md`
- All three nodes list the same three sync points at the same level of detail.
  This defeats progressive disclosure — an agent working in `models/` gets the
  same text whether it loads root or the leaf.
- Single source of truth should be: **`backend/app/models/AGENTS.md`** owns
  the definitive list (it is the backend source). `frontend/src/lib/AGENTS.md`
  should reference models/ and note the frontend-side sync obligation.
  `AGENTS.md` (root) should reduce to a one-line summary: "Three manual
  backend↔frontend sync points live at `backend/app/models/`."

### Five auth-guard gaps (unprotected routes)
- Found in: `backend/app/auth/AGENTS.md` (lists all five) and
  `backend/app/api/AGENTS.md` (lists all five again identically)
- Single source of truth should be: **`backend/app/api/AGENTS.md`** — the gaps
  are a property of where auth guards are applied (the routes), not of the auth
  module itself. `backend/app/auth/AGENTS.md` should reduce to one line:
  "Several routes currently omit auth guards — see `api/AGENTS.md`."

### Executor bypasses R2Client.sign_path()
- Found in: `backend/app/storage/AGENTS.md` (full explanation) and
  `backend/app/services/AGENTS.md` (repeats the full explanation)
- Single source of truth should be: **`backend/app/storage/AGENTS.md`** — this
  is a fact about the storage module's interface. `services/AGENTS.md` should
  reduce to: "The executor bypasses `R2Client.sign_path()` for performance —
  see `storage/AGENTS.md`."

### sys.path import hack for audio_transcription
- Found in: `backend/audio_transcription/AGENTS.md` (full explanation),
  `backend/app/services/AGENTS.md` (re-explains it), and
  `backend/app/api/AGENTS.md` (also mentions it)
- Single source of truth should be: **`backend/audio_transcription/AGENTS.md`**
  — it owns this module. `services/AGENTS.md` and `api/AGENTS.md` should
  reduce each to one line pointing there.

### FIREWORK_API_KEY shared between two consumers
- Found in: `backend/app/agents/AGENTS.md` (owns it, correct),
  `backend/app/agents/image_text_matching/AGENTS.md` (re-explains the rate-limit
  consequence), and `backend/audio_transcription/AGENTS.md` (also re-explains it)
- Single source of truth should be: **`backend/app/agents/AGENTS.md`** per the
  LCA decision from Phase 2. The two leaf nodes should reduce to: "Shares
  `FIREWORK_API_KEY` with the other Fireworks consumer — see `agents/AGENTS.md`."

---

## Broken Downlinks

No broken downlinks found. All 23 Downlinks entries resolve to existing files.
All nodes with children that have their own AGENTS.md include a Downlinks section.

---

## Knowledge Gaps

### backend/app/agents/image_extraction/AGENTS.md
- Missing: The `resnet18_places365.pth.tar` model file (~90 MB) exists in this
  directory. It is not referenced by the pipeline description. An agent adding
  scene-classification features might assume it's available and active; an agent
  cleaning up dead code might delete it. Its status (active, dead, or reserved)
  should be explicitly stated.

### backend/app/services/AGENTS.md
- Missing: There are two execution entry points — `execute_workflow(blueprint)`
  (synchronous, returns `WorkflowExecutionResult` dict) and
  `execute_workflow_streaming(blueprint)` (async generator, yields SSE strings).
  The API route uses streaming; direct callers from tests or scripts must know
  which to call. This is a callers' contract that is absent from the node.

### backend/app/api/AGENTS.md
- Missing: `POST /api/v1/workflows/copilot/plan` enforces a hard 8000-character
  limit on the `message` field. This is a contract that frontend callers must
  respect and that backend tests must not exceed.

### frontend/src/lib/stores/AGENTS.md
- Missing: `workflowStore.importWorkflowStructure()` calls
  `sanitizeWorkflowEdgesAgainstRegistry()` before restoring edges. This silently
  drops any edges whose source or target node type is no longer in
  `nodeRegistry.ts`. This is a migration behavior — after a node type is renamed,
  importing old saved workflows will lose those connections silently.

---

## Summary
- Total nodes audited: 23
- Nodes requiring changes: 8
  - Dead weight: 2 (agents/, auth/)
  - Duplication sources: 6 nodes contain duplicate content (auth/, api/, storage/,
    services/ ×2, image_text_matching/, audio_transcription/)
  - Knowledge gaps: 4 (image_extraction/, services/, api/, stores/)
- No broken downlinks
- Estimated token reduction from deduplication fixes: ~120–150 tokens
  (removing 5 repeated explanations of 3–6 lines each)

---

## Fix Plan
All issues will be fixed in-place. Fixes applied:
1. Fix garbled LLM routing table in `agents/AGENTS.md`
2. Trim JWKS URL dead weight from `auth/AGENTS.md`; reduce auth-gap note to pointer
3. Reduce auth-gap duplication: `api/AGENTS.md` owns it, `auth/AGENTS.md` defers
4. Reduce R2 bypass duplication: `storage/AGENTS.md` owns it, `services/AGENTS.md` defers
5. Reduce sys.path duplication: `audio_transcription/AGENTS.md` owns it,
   `services/AGENTS.md` and `api/AGENTS.md` point there
6. Reduce FIREWORK_API_KEY duplication: `agents/AGENTS.md` owns it, leaves point there
7. Reduce sync-point duplication: `models/AGENTS.md` owns detail, root summarizes
8. Add `resnet18_places365.pth.tar` status to `image_extraction/AGENTS.md`
9. Add dual execution entry points to `services/AGENTS.md`
10. Add 8000-char copilot limit to `api/AGENTS.md`
11. Add `sanitizeWorkflowEdgesAgainstRegistry` to `stores/AGENTS.md`
