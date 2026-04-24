# Agent — Image Extraction

## Purpose
This agent owns keyframe extraction from video files: a 5-phase pipeline that
produces a deduplicated, quality-ranked set of representative frames. It does
NOT make any LLM calls, does NOT upload images, and does NOT match images to
text (that is `agents/image_text_matching/`). All output is written to local
filesystem paths.

## Architecture
The single entry point is `run_keyframe_pipeline(video_path, config?)` in
`keyframe_pipeline.py`. It is called by `api/v1/image_extraction.py` (from an
uploaded or R2-sourced video) and by `services/workflow_executor.py` (as the
`ImageExtraction` node executor).

The pipeline phases: (0) video inspection, (1) uniform candidate timestamp
generation, (2) frame extraction via OpenCV, (3) quality scoring (blur
detection via Laplacian variance + eye-open detection via Haar cascades),
(4) perceptual hash deduplication via the custom DCT-based `phash.py`,
(5) final selection with per-scene coverage guarantee.

## Contracts
- `run_keyframe_pipeline(video_path: str, config: Optional[Dict] = None) -> Dict`
  returns a dict with keys: `selected_frames`, `selected_frames_ranked`,
  `output_dir`, `candidates_dir`, `selected_dir`, `candidates_json`,
  `rejected_json`, `selected_json`, `selected_ranked_json`, `stats`.
- `DEFAULT_CONFIG` is the exported config dict. Override individual keys by
  passing a partial dict — unspecified keys retain defaults.
- Key defaults: `sample_period_seconds=5.0`, `blur_threshold=30.0`,
  `max_total_frames=10`, `dedup_threshold=8`, `per_scene_target=2`.
- Output is written to `outputs/keyframes/` relative to the process CWD unless
  `output_dir` is overridden in config.

## Pitfalls
- The pipeline switched from scene-detection to uniform sampling (recent commit).
  `scene_detection.py` and the functions `generate_all_candidates` /
  `sample_timestamps` in `keyframe_pipeline.py` are still exported and callable
  but are NOT invoked by `run_keyframe_pipeline`. They are dead from the
  pipeline's perspective — do not reactivate them without understanding why they
  were replaced.
- `detect_scenes` lazily imports `scenedetect`. If `scenedetect` is not
  installed, calling `detect_scenes` raises `ImportError` at runtime, not at
  import time — this will not surface in startup checks.
- `blur_threshold=30.0` is intentionally low compared to the common
  recommendation of 100+. It was calibrated specifically for video frame
  content. Do not raise it to "fix" aggressive filtering without re-calibrating
  against representative videos.
- Haar cascade XML paths depend on OpenCV's data directory in the installed
  environment. Tests that mock `cv2` must also mock the cascade classifier
  instantiation, or they will fail with a file-not-found error on the XML path.
- The `phash.py` implementation is a custom DCT-based perceptual hash that
  replaced the `imagehash` library (scipy/pywavelets removed as dependencies).
  Do not re-add `imagehash` — the custom implementation is intentional.
- `resnet18_places365.pth.tar` (~90 MB) sits in this directory but is not
  referenced by the current pipeline code. It appears to be a leftover from
  an earlier scene-classification approach that was replaced by the uniform
  sampling strategy. Do not load it — treat it as dead weight pending cleanup.
