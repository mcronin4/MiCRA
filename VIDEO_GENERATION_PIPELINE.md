# Video Generation Pipeline

## Overview

The Video Generation pipeline is an AI Action node in MiCRA that generates short MP4 videos using Google's Veo 3.1 API. It includes a smart preprocessing layer that optimizes user inputs for Veo's constraints before making the API call.

**Pipeline flow:**

```
User Inputs → Image Selection → Image Analysis → Prompt Enhancement → Veo 3.1 → Video Output
```

## Veo 3.1 Constraints

| Constraint | Detail |
|------------|--------|
| Max reference images | 3 |
| Aspect ratios | `16:9` (landscape), `9:16` (portrait) |
| Durations | `4`, `6`, or `8` seconds |
| Duration with images | Must be `8` seconds when using reference images |
| Resolution | `720p`, `1080p`, `4k` |

## Preprocessing Pipeline

The preprocessor (`backend/app/agents/video_generation/preprocessor.py`) sits between user inputs and the Veo API call. It uses **Gemini 2.5 Flash** for intelligent input processing.

### 1. Image Selection (`select_best_images`)

When more than 3 reference images are provided:

- **Score-based:** If images have scores from an upstream ImageMatching node, the top 3 by score are selected.
- **LLM-based:** If no scores are available, Gemini 2.5 Flash evaluates each image's relevance to the prompt/context and picks the best 3.
- **Pass-through:** If 3 or fewer images are provided, all are used.

### 2. Image Analysis (`analyze_images`)

Each selected reference image is sent to Gemini 2.5 Flash with the prompt:

> "Describe this image in detail — subject, composition, colors, mood, and setting."

This produces textual descriptions that inform the prompt enhancement step.

### 3. Prompt Enhancement (`enhance_prompt`)

All collected context is sent to Gemini with a system prompt instructing it to create a detailed, cinematic prompt for Veo 3.1. The enhanced prompt includes:

- Camera movement descriptions
- Lighting and mood
- Pacing and timing
- How to incorporate the reference images
- Kept under **200 words** (concise to avoid API issues)

**Safety rules enforced:**
- Real names, user names, and personal names are **never included** — replaced with generic descriptors (e.g. "a traveler", "a chef")
- A regex-based `_strip_names()` fallback catches any names Gemini may have kept
- Simple, clear language is used to avoid triggering Veo safety filters

### 4. Orchestrator (`preprocess_video_inputs`)

Coordinates the full pipeline:

1. Collects user prompt, text context, images, and videos from inputs
2. Calls `select_best_images()` to pick the best reference images
3. Calls `analyze_images()` to describe the selected images
4. Calls `enhance_prompt()` to create the final Veo prompt
5. Returns the enhanced prompt, selected image bytes, and metadata

## Configuration Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `duration_seconds` | `"4"`, `"6"`, `"8"` | `"8"` | Video duration |
| `aspect_ratio` | `"16:9"`, `"9:16"` | `"9:16"` | Video aspect ratio |
| `resolution` | `"720p"`, `"1080p"`, `"4k"` | `"720p"` | Output resolution |
| `negative_prompt` | Free text | `""` | Content to avoid |
| `user_prompt` | Free text | `""` | User's video description |

## Input Connections

The VideoGeneration node accepts three optional inputs:

- **images** (`ImageRef[]`): Reference images from ImageBucket or ImageMatching
- **videos** (`VideoRef[]`): Video inputs from VideoBucket (tracked for future use)
- **text** (`Text`): Text context from TextBucket or Transcription

## Output

- **generated_video** (`VideoRef`): The generated MP4 video (artifact path or data URL)

The `prompt_bundle` metadata (available in `node.outputs.prompt_bundle`) contains:
- `enhanced_prompt`: The prompt sent to Veo
- `preprocessing`: Metadata about the preprocessing steps
- `veo_params`: The parameters sent to Veo

## Standalone API Endpoint

For testing outside the workflow engine:

```
POST /api/v1/video-generation/generate
```

Request body:
```json
{
  "prompt": "A cinematic sunset over the ocean",
  "images": ["data:image/jpeg;base64,..."],
  "text_context": "Optional additional context",
  "duration_seconds": "8",
  "aspect_ratio": "9:16",
  "resolution": "720p",
  "negative_prompt": ""
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | API key for Gemini (preprocessing + Veo) |
| `VEO_ENABLE_LIVE_CALLS` | No | Set to `true` to enable actual Veo API calls |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Alternative auth via Vertex AI service account |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "VEO_ENABLE_LIVE_CALLS is not enabled" | Set `VEO_ENABLE_LIVE_CALLS=true` in your `.env` |
| "No auth configured" | Set `GEMINI_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` |
| Veo returns no response | Check for content policy violations or invalid reference images |
| Duration overridden to 8s | Veo requires 8s duration when reference images are used |
| Preprocessing fails silently | Check logs; the pipeline falls back to simple prompt concatenation |
