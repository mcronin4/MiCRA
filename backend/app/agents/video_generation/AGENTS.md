# Agent — Video Generation

## Purpose
This agent owns AI video generation via Google Veo 3.1 and the multi-step
preprocessing pipeline that prepares inputs for it. It does NOT handle audio
extraction, transcription, or frame extraction (those are separate agents).
It does NOT call the Fireworks API — all LLM calls in the preprocessor use
Gemini via `app/llm/gemini.py`.

## Architecture
Two files: `preprocessor.py` runs before the Veo call and `generator.py` runs
the Veo call itself. The preprocessor makes up to N+2 Gemini calls (N image
analyses + optional image selection + prompt enhancement) before a single Veo
API call is made.

Called by `api/v1/video_generation.py` and by `services/workflow_executor.py`
(as the `VideoGeneration` node executor).

Two auth modes are auto-detected at runtime:
- **Vertex AI mode**: when `GOOGLE_APPLICATION_CREDENTIALS` is set. Uses service
  account credentials against the GCP project.
- **Gemini API key mode**: fallback. Uses `app/llm/gemini.py` key rotation.

## Contracts
- `generate_video_with_veo(prompt, images=None, params=None) -> bytes` returns
  raw MP4 bytes. The call will raise `RuntimeError` immediately if
  `VEO_ENABLE_LIVE_CALLS` env var is not set to `"true"` — this is an
  intentional kill switch for CI and staging environments.
- `params` keys: `duration_seconds` (str, default `"8"`), `aspect_ratio`
  (`"16:9"` or `"9:16"`, default `"9:16"`), `resolution` (`"720p"`, `"1080p"`,
  `"4k"`, default `"720p"`), `negative_prompt` (optional str).
- When reference images are provided, `duration_seconds` is forced to `"8"`
  regardless of the requested value. This is a Veo 3.1 API constraint.
- `preprocess_video_inputs(params, inputs) -> Tuple[str, list[bytes], dict]`
  expects `inputs["_image_bytes"]` as a `list[bytes]`. Optional:
  `inputs["_image_scores"]` (list of float) and `inputs["text"]` (str or list).
- `VIDEO_STYLE_DIRECTIVES` dict (5 preset style keys) is the extension point
  for adding new video styles.

## Pitfalls
- The hardcoded default GCP project `"core-avenue-488216-t2"` is a real
  production resource. If `GOOGLE_CLOUD_PROJECT` is not set in a Vertex AI
  environment, requests will be billed to that project.
- The polling loop in `generator.py` uses `time.sleep` (blocking). Do not call
  `generate_video_with_veo` from within an async context — wrap it in
  `asyncio.run_in_executor` or the event loop will block for up to 300 seconds.
- The preprocessor accepts video files in `inputs` but the comment explicitly
  states "videos are not currently used by Veo." Video input handling in
  `preprocess_video_inputs` is dead code — do not build on it.
- Missing `VEO_ENABLE_LIVE_CALLS=true` produces a generic `RuntimeError` with
  no hint about the env var. New contributors debugging a "video generation
  doesn't work" report often spend time here.
- Image selection via Gemini is only triggered when >3 images are provided AND
  no upstream scores are in `inputs["_image_scores"]`. If scores are present,
  Gemini selection is skipped and the top 3 by score are used directly.
