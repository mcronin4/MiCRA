# Agents — AI Task Processors

## Purpose
This directory is the parent namespace for all backend AI task processors. Each
subdirectory implements one content-transformation capability. This parent
package owns no shared logic — there is no base class, no shared input/output
schema, and no inter-agent orchestration here. Orchestration lives in
`services/workflow_executor.py`.

## Architecture
Each agent is a standalone module called directly by the executor and by its
corresponding `api/v1/` route. Agents do not call each other. The executor is
the only integration point.

LLM routing by agent:
- **Gemini** (via `app/llm/gemini.py`): `image_generation`, `quote_extraction`,
  `summarization`, `text_generation`, `video_generation` (preprocessor).
- **Fireworks AI** (independent of `llm/`, uses `FIREWORK_API_KEY`):
  `image_text_matching` (Qwen 2.5 VL vision model).
- **No LLM**: `image_extraction` (pure OpenCV/NumPy/Pillow).
- **Transcription**: handled by `backend/audio_transcription/` (outside this
  package) via Fireworks Whisper — not a subdirectory of `agents/`.

## Contracts
- There is no shared agent interface. Each agent defines its own function
  signatures independently. Do not assume a common calling convention.
- All Gemini-calling agents route through `app/llm/gemini.py`. Never instantiate
  a Gemini client directly in an agent — use `query_gemini` or
  `run_with_gemini_client` from `llm/`.
- `FIREWORK_API_KEY` is shared between `image_text_matching` and
  `audio_transcription/`. Rate limits on one affect the other.
- The empty `quality/` subdirectory is a placeholder. The empty `transcription/`
  subdirectory is a ghost — actual transcription lives in
  `backend/audio_transcription/`.

## Pitfalls
- Async consistency is not enforced. Several agents declare `async def` entry
  points but execute blocking synchronous LLM calls inside. Callers must not
  assume agents are safe to `await` concurrently without wrapping in
  `run_in_executor`.
- `summarization/` has no `__init__.py`. It is not a proper Python package.
  Import as `from backend.app.agents.summarization.summarizer import summarize`,
  not `from backend.app.agents.summarization import summarize`.
- `image_generation/generator.py` hardcodes the MIME type of image-to-image
  input as `image/png` regardless of the actual format. Passing JPEG bytes
  produces incorrect API behavior silently.
- Several agents have comment-documented ambitions (chain-of-density for
  summarization, timestamp-citation per summary line, timestamp scoring in image
  matching) that are NOT implemented. Do not build on these as if they exist.

## Downlinks
- [image_extraction](./image_extraction/AGENTS.md) — 5-phase keyframe pipeline with custom pHash; no LLM calls; dead scene-detection code
- [image_text_matching](./image_text_matching/AGENTS.md) — Fireworks AI VLM matcher; async-but-blocking; `FIREWORK_API_KEY` required
- [text_generation](./text_generation/AGENTS.md) — two parallel architectures (preset-driven vs. hardcoded standalone); orphaned parsers
- [video_generation](./video_generation/AGENTS.md) — Veo 3.1; kill switch env var; hardcoded production GCP project; blocking poll loop
