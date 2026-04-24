# LLM Client — Gemini

## Purpose
This module owns the Gemini API client and all multi-key rotation logic. It is
the single point through which every Gemini call in the backend flows. It does
NOT own prompt construction, model selection per feature (callers pass the model
name), or the Fireworks AI client (that lives independently in
`agents/image_text_matching/` and `audio_transcription/`).

## Architecture
All agents and services that call Gemini import `query_gemini`,
`run_with_gemini_client`, or `generate_content_with_gemini` from here.
`GeminiRotationManager` is a module-level singleton instantiated on first use
via `get_gemini_rotation_manager()`. The manager is shared across all callers in
the same process — rotation state is global, not per-caller.

Consumers: every agent except `image_text_matching` and `image_extraction`, plus
`services/workflow_copilot.py`, `services/blueprint_compiler.py`, and
`agents/video_generation/preprocessor.py`.

## Contracts
- Key rotation is tracked per `(key_slot, model)` pair, not globally — a key
  cooling down for `gemini-2.5-flash` is still available for `gemini-2.5-pro`.
- `GEMINI_API_KEY_1` through `GEMINI_API_KEY_5` are the rotation keys.
  `GEMINI_API_KEY` (no number) is a legacy single-key fallback — with only this
  var set, rotation provides no benefit.
- `query_gemini` silently strips ` ```json ... ``` ` markdown fences from
  structured-output responses before JSON parsing. Callers must not pre-strip.
- Default model: `gemini-2.5-flash`. Override per-call via the `model=` kwarg
  or globally via the `GEMINI_MODEL` env var.
- `reset_gemini_rotation_manager()` tears down the singleton and forces
  re-initialization — needed in tests that want a clean rotation state.

## Pitfalls
- Daily quota detection is heuristic string matching on `"perday"`, `"daily"`,
  `"rpd"` in the error message. New quota-error formats from the API will not be
  detected and will not trigger the 24-hour cooldown, causing repeated 429s.
- `GeminiProvidersExhaustedError` is raised when all keys are in cooldown. This
  surfaces to the caller as an exception, not a graceful degradation — callers
  must handle it explicitly.
- The singleton is module-level and thread-safe, but it is not process-safe. In
  a multi-worker deployment each worker has its own rotation state — keys are not
  shared across processes.
- `format_exception_for_user()` sanitizes error messages before returning them
  to API callers. Do not bypass it by catching raw exceptions and re-raising —
  raw Gemini errors may contain key material or internal API details.
