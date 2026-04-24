# Audio Transcription (Standalone)

## Purpose
This module owns audio and video transcription via the Fireworks AI Whisper API
(`whisper-v3-turbo`). It lives outside the `app/` package by design — it
predates the FastAPI app structure. It does NOT own the Gradium STT path (that
is `services/gradium_voice.py`), FastAPI routing, or any Supabase/R2 integration.

## Architecture
`audio_transcription.py` provides two public functions consumed by two callers:
- `api/v1/transcription.py` imports it via `sys.path` manipulation (appends
  `backend/` to `sys.path` before importing `audio_transcription.audio_transcription`)
- `services/workflow_executor.py` imports it via bare module path, also relying
  on `backend/` being on `sys.path` at runtime

Because this module is outside `app/`, standard Python package tooling (type
checkers, linters, absolute imports from within `app/`) will not resolve it
without the `sys.path` manipulation in place.

The Fireworks endpoint (`https://audio-turbo.api.fireworks.ai/v1/audio/transcriptions`)
and model (`whisper-v3-turbo`) are hardcoded. Retry logic: 4 attempts,
exponential backoff (1s → 2s → 4s → 8s cap) on HTTP 408, 409, 425, 429,
500-504.

## Contracts
- `transcribe_audio_or_video_file(audio_path: str, model=None) -> list[dict] | None`
  Returns `[{"start": float, "end": float, "text": str}]` per segment, or
  `None` on failure after all retries.
- `download_audio(url: str) -> str | None` requires `yt-dlp` (optional
  dependency). Returns local file path, or `None` if yt-dlp is unavailable or
  download fails.
- Required env var: `FIREWORK_API_KEY`. No default — absent key = silent API
  failure on first call, not at import time.
- `FIREWORK_API_KEY` is shared with `agents/image_text_matching/` on a different
  Fireworks endpoint — see `agents/AGENTS.md` for the shared-credential note.

## Pitfalls
- `yt-dlp` is lazily imported with a `YT_DLP_AVAILABLE` flag. URL transcription
  silently returns `None` if yt-dlp is not installed — there is no startup
  warning. The `/api/v1/transcription` (URL-based) endpoint will appear to work
  but return empty results.
- The `sys.path` manipulation in `api/v1/transcription.py` is order-dependent.
  If the import order changes or if the file is moved, the path manipulation may
  resolve incorrectly, causing a `ModuleNotFoundError` that is difficult to
  trace.
- The `backend/app/agents/transcription/` directory exists on disk but contains
  only `__pycache__` with no source files. It is a ghost directory. The actual
  transcription implementation is here, not there.
- This module is excluded from standard test discovery if pytest is run from
  within `app/` rather than from `backend/`. Run tests from `backend/` or ensure
  `backend/` is on `PYTHONPATH`.
