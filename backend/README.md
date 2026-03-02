
## Video Generation (GENERATE_VIDEO)

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | For live calls* | — | Path to GCP service-account JSON key (Vertex AI mode) |
| `GEMINI_API_KEY` | For live calls* | — | Gemini API key (alternative to service account) |
| `VEO_ENABLE_LIVE_CALLS` | No | `false` | Set to `true` to enable real Veo API calls |
| `ARTIFACT_BACKEND` | No | — | Set to `local` for dev-local artifact storage |
| `ARTIFACTS_DIR` | No | `.artifacts/` | Override local artifact storage directory |

*One of `GOOGLE_APPLICATION_CREDENTIALS` or `GEMINI_API_KEY` is required for live Veo calls.

### Local Asset Setup

1. Create the asset folder at repo root:

```bash
mkdir local_test_assets
```

2. Add files:

```
local_test_assets/
  image_01.jpg        # Reference image (any .jpg/.png/.webp)
  image_02.png
  image_03.jpg
  transcript.txt      # Optional text context
```

Supported types: `.jpg`, `.jpeg`, `.png`, `.webp`, `.txt`

Minimal recommended set: 1-6 images + optional `transcript.txt`.

### Commands

**Register local assets:**

```bash
ARTIFACT_BACKEND=local python backend/scripts/dev_register_assets.py
```

Prints a JSON mapping of `filename -> artifact_id`.

**Run video generation workflow (dry run — no Veo call):**

```bash
ARTIFACT_BACKEND=local python backend/scripts/dev_run_generate_video.py
```

**Run with real Veo call:**

```bash
ARTIFACT_BACKEND=local \
VEO_ENABLE_LIVE_CALLS=true \
GOOGLE_APPLICATION_CREDENTIALS="/c/keys/core-avenue-488216-t2-595efd63eb1e.json" \
python backend/scripts/dev_run_generate_video.py \
  --prompt "A marketing video for travelling in Thailand" \
  --duration 8 \
  --aspect-ratio 16:9
```

**Run tests (no network):**

```bash
cd backend && python -m pytest tests/test_video_generation.py -v
```

### Example Node Config JSON

```json
{
  "type": "VideoGeneration",
  "params": {
    "duration_seconds": "8",
    "aspect_ratio": "9:16",
    "resolution": "720p",
    "negative_prompt": "",
    "user_prompt": "A smooth cinematic pan across a city skyline at golden hour",
    "image_artifact_ids": []
  }
}
```

**Veo parameter constraints:**
- `duration_seconds`: `"4"`, `"6"`, or `"8"`
- `aspect_ratio`: `"16:9"` or `"9:16"`
- `resolution`: `"720p"`, `"1080p"`, or `"4k"`

### Node Ports

**Inputs** (all optional):
- `images` (ImageRef, list) — reference images from upstream nodes
- `text` (Text, single) — transcript or context text

**Outputs:**
- `generated_video` (VideoRef, single) — local path or data URL to the MP4
- `prompt_bundle` (JSON, single) — generation metadata for reproducibility
