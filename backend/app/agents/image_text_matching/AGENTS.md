# Agent — Image Text Matching

## Purpose
This agent owns semantic matching of video keyframes to text summaries using
the Fireworks AI Qwen 2.5 VL vision-language model. It is the only agent in
the backend that uses a non-Google LLM. It does NOT extract images (that is
`agents/image_extraction/`), does NOT use the Gemini rotation manager, and does
NOT route through `app/llm/gemini.py`.

## Architecture
`ImageTextMatcherVLM` is an async context manager class in `vlm_analysis.py`.
It is called by `api/v1/image_matching.py` (direct API endpoint) and by
`services/workflow_executor.py` (as the `ImageMatching` node executor). The
matching pipeline makes 3 Fireworks API calls per image-text pair: OCR
extraction, image captioning, and semantic similarity rating. Results are
combined into a weighted `combined_score`. OCR and caption results are cached
in-memory by `image_id` for the lifetime of the matcher instance.

The detail score component uses a Python word-overlap heuristic (5+ char words,
stopword-filtered) — this is NOT an LLM call.

## Contracts
- `ImageTextMatcherVLM` MUST be used as `async with ImageTextMatcherVLM(...) as m`
  — the constructor does not initialize the Fireworks client; `__aenter__` does.
  Instantiating without the context manager will produce an uninitialized client.
- `VLMConfig` reads `FIREWORK_API_KEY` from env. There is no default — if the
  env var is absent, the value is `None` and the Fireworks client will fail
  silently on the first API call, not at construction.
- `VLMConfig` reads `FIREWORKS_VLM_MODEL` (or fallback `FIREWORKS_MODEL`). No
  default is set in code — absent env var = `None` = silent API error.
- Weights: `semantic_weight + detail_weight` must equal `1.0`. Violation is not
  validated — it will silently produce out-of-range scores.
- Shared types: `TextSummary`, `ImageCandidate`, `ImageMatch` are defined in
  `matching_types.py` and must match the shapes passed by the executor.

## Pitfalls
- All `async def` methods make synchronous blocking Fireworks API calls inside.
  The Fireworks client's `.create()` is synchronous despite the `async def`
  wrapper. Do not call these methods from within an asyncio event loop without
  wrapping in `run_in_executor` — they will block the loop.
- `ImageMatch.timestamp_score` is always `0.0`. The `VLMConfig` weights comment
  explicitly zeros out timestamp scoring. Do not activate this field without
  implementing the scoring logic in `vlm_analysis.py`.
- `FIREWORK_API_KEY` is shared with `audio_transcription/` on a different
  Fireworks endpoint — rate limits on one affect the other. See
  `agents/AGENTS.md` for the LCA note.
- In-memory caching of OCR/caption results is per-matcher-instance. Cache is
  lost when the context manager exits. Long-running workflows that process the
  same images multiple times will repeat API calls across separate invocations.
