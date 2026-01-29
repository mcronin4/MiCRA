# Image Extraction Module

Keyframe extraction and quality filtering for video content.

## Keyframe Pipeline

Extracts quality-filtered keyframes from video for downstream Image-Text Matching.

### Quick Start

```bash
cd backend

# From local video file
python -m app.agents.image_extraction.run_keyframes --video path/to/video.mp4

# From YouTube URL
python -m app.agents.image_extraction.run_keyframes --url "https://youtube.com/watch?v=..."

# Keep the downloaded video after processing
python -m app.agents.image_extraction.run_keyframes --url "https://youtube.com/watch?v=..." --keep-video
```

Or run directly:
```bash
cd backend/app/agents/image_extraction
python run_keyframes.py --video path/to/video.mp4
python run_keyframes.py --url "https://youtube.com/watch?v=..."
```

### CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--video`, `-v` | - | Input video path (or use `--url`) |
| `--url`, `-u` | - | YouTube URL to download and process |
| `--keep-video` | false | Keep downloaded video after processing |
| `--download-dir` | `downloads` | Directory for downloaded videos |
| `--out`, `-o` | `outputs/keyframes` | Output directory |
| `--max_total` | 25 | Max total keyframes |
| `--per_scene` | 2 | Target frames per scene |
| `--sample_period` | 5.0 | Seconds between samples |
| `--min_extra` | 0 | Min extra samples per scene |
| `--max_extra` | 3 | Max extra samples per scene |
| `--blur_threshold` | 100.0 | Min Laplacian variance |
| `--exposure_low` | 30 | Min mean grayscale |
| `--exposure_high` | 225 | Max mean grayscale |
| `--dedup_threshold` | 8 | pHash Hamming distance for duplicates |
| `--scene_threshold` | 30.0 | PySceneDetect threshold |

### Output Structure

```
outputs/keyframes/<video_name>/<run_timestamp>/
├── candidates/          # All extracted frames before filtering
│   └── scene_0_t_1234.jpg
├── selected/            # Final selected keyframes
│   └── scene_0_t_1234.jpg
├── candidates.json      # Metadata for frames that passed filters
└── selected.json        # Metadata for final selected frames
```

### Metadata Format (selected.json)

```json
[
  {
    "frame_path": "...",
    "selected_path": "...",
    "timestamp": 1.234,
    "scene_id": 0,
    "quality_score": 0.75,
    "face_present": 1,
    "blur_score": 450.5,
    "exposure_score": 128.3,
    "eyes_open": true,
    "emotion_analysis": {
      "face_detected": true,
      "dominant_emotion": "happy",
      "probabilities": {...}
    },
    "scene_analysis": {
      "top_scene": "office",
      "top_k_scenes": [...]
    }
  }
]
```

### Pipeline Phases

1. **Scene Detection** - PySceneDetect identifies scene boundaries
2. **Candidate Sampling** - Uniform timestamps within each scene
3. **Frame Extraction** - Decode and save frames via OpenCV
4. **Quality Filtering** - Reject blurry, over/under-exposed, eyes-closed frames
5. **Deduplication** - Remove near-duplicates via pHash
6. **Selection** - Pick top frames per scene, respect global cap

### Dependencies

```
opencv-python
numpy
pillow
mediapipe
imagehash
deepface
torch
torchvision
scenedetect[opencv]
```

### Config Tuning

- **Blurry frames?** Increase `blur_threshold`
- **Too dark/bright?** Adjust `exposure_low`/`exposure_high`
- **Too many duplicates?** Lower `dedup_threshold`
- **More frames per scene?** Increase `per_scene` and `max_extra`
- **Fewer total frames?** Lower `max_total`

