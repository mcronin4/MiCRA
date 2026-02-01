# Image-Text Matching Module

Multi-modal system for matching video frames to text summaries using vision-language models.

## Overview

This module provides two approaches for matching images to text summaries:

1. **Original (embeddings.py)**: Uses SigLIP, BLIP-2, and Tesseract OCR (requires heavy ML dependencies)
2. **VLM Staged (vlm_analysis.py)**: Uses Fireworks Qwen 2.5 VL with separate API calls (recommended)

## Setup

### For VLM Approaches (Recommended)

1. Install dependencies:
```bash
pip install fireworks-ai>=0.10.0
```

2. Set up your Fireworks API key:
```bash
# Add to .env file
FIREWORK_API_KEY=your_api_key_here
```

Or export it in your shell:
```bash
export FIREWORK_API_KEY=your_api_key_here
```

### For Original Approach (Optional)

If you want to use the original SigLIP/BLIP-2/OCR implementation, uncomment and install the ML dependencies in `requirements.txt`:

```bash
pip install torch torchvision transformers sentencepiece scikit-learn pytesseract
```

You'll also need to install Tesseract OCR system-wide.

## Usage

### Quick Test

Run the comparison script to test both approaches:

```bash
cd backend/app/agents/image_text_matching
python test_vlm_comparison.py
```

Options:
- `--skip-original`: Skip the original matcher (useful if ML deps not installed)
- `--downsampling 1024`: Downsample images to max 1024px (reduces token costs)
- `--save-json`: Save results to JSON file
- `--detailed`: Show detailed per-summary evaluation with ground truth comparison

Example:
```bash
python test_vlm_comparison.py --skip-original --downsampling 1024 --detailed
```

### Ground Truth Evaluation

The test script includes ground truth annotations for objective evaluation. Edit the `GROUND_TRUTH` dict in `test_vlm_comparison.py` to specify correct image matches for each summary:

```python
GROUND_TRUTH = {
    "Opening and Vision": ["TI1"],
    "Apps SDK": ["TI2"],
    "Agent Kit": ["TI3"],
}
```

The evaluation reports:
- **Top-1 Accuracy**: Percentage of times the top prediction is correct
- **Top-3 Accuracy**: Percentage of times the correct answer is in top-3
- **Mean Reciprocal Rank (MRR)**: Average of 1/rank for each correct prediction

Use `--detailed` flag to see per-summary results with ✓/✗ indicators.

### Using VLM Staged Matcher

```python
import asyncio
from app.agents.image_text_matching.vlm_analysis import ImageTextMatcherVLM
from app.agents.image_text_matching.embeddings import TextSummary, ImageCandidate

# Use as context manager for proper resource cleanup
async def match_images():
    async with ImageTextMatcherVLM(
        max_image_dimension=1024,  # Optional downsampling
        weights={'semantic_weight': 0.6, 'detail_weight': 0.4}
    ) as matcher:
        # Match images to summaries
        results = await matcher.match_summaries_to_images(
            summaries=summaries,
            candidates=candidates,
            top_k=3
        )
        return results

# Run async function
results = asyncio.run(match_images())
```


## Environment Variables

### Required for VLM Approaches

- **FIREWORK_API_KEY**: Your Fireworks AI API key
  - Get one at: https://fireworks.ai/
  - Used by both VLM matchers

## Configuration

### VLM Config (config_vlm.py)

Key settings:
- `FIREWORKS_MODEL`: Qwen model to use (default: qwen2-vl-72b-instruct)
- `MAX_IMAGE_DIMENSION`: Default max dimension for downsampling (default: None)
- `DEFAULT_TEMPERATURE`: Model temperature (default: 0.0 for deterministic)
- `MAX_TOKENS_*`: Token limits for different tasks

### Downsampling

To reduce token costs, you can downsample images before sending to the VLM:

```python
async with ImageTextMatcherVLM(
    max_image_dimension=1024  # Downsample to 1024px max
) as matcher:
    results = await matcher.match_summaries_to_images(summaries, candidates)
```

This maintains aspect ratio and can significantly reduce costs with minimal accuracy impact.

## File Structure

```
image_text_matching/
├── embeddings.py                 # Original: SigLIP/BLIP-2/OCR
├── vlm_analysis.py      # VLM Staged: Multi-stage API calls (recommended)
├── config.py                     # Config for original implementation
├── config_vlm.py                 # Config for VLM implementation
├── utils_vlm.py                  # Shared VLM utilities
├── test_matching.py              # Test script for original implementation
├── test_vlm_comparison.py        # Comparison test script
└── test_images/                  # Test images folder
```

## Approaches Comparison

### VLM Staged (vlm_analysis.py) - Recommended

**How it works:**
- Makes 3 separate API calls per image-text pair
- OCR extraction, image captioning, similarity rating
- Combines scores with weighted average

**Pros:**
- Drop-in replacement for original approach
- Each task optimized with specific prompts
- Easy to debug and tune
- Production-ready with API-based inference
- No GPU requirements
- Scales easily

**Cons:**
- More API calls = higher cost than batch approaches
- Sequential processing (though cached per image)

### Original (embeddings.py) - Reference Implementation

**How it works:**
- Uses SigLIP for semantic similarity
- BLIP-2 for image captioning
- Tesseract OCR for text extraction

**Pros:**
- No API dependencies
- Can run fully offline
- Fine-grained control

**Cons:**
- Requires 8-10GB disk space for models
- Needs GPU for practical performance
- Complex deployment requirements
- High infrastructure costs

## Testing

The `test_vlm_comparison.py` script compares both approaches:

1. Loads test images from `test_images/`
2. Runs both matchers
3. Displays side-by-side comparison
4. Evaluates against ground truth
5. Calculates overlap and accuracy metrics

Example output:
```
Summary: Opening and Vision
Original (SigLIP/BLIP)              VLM Staged
-------------------------------------------------------------
1. TI1 (0.847)                      1. TI1 (0.892)
2. TI3 (0.734)                      2. TI2 (0.745)

Analysis:
  ✓ Top match agreement: Orig-Staged
  Orig-Staged overlap: 66%

EVALUATION AGAINST GROUND TRUTH
================================================================================
Approach                       Top-1 Acc       Top-3 Acc       MRR       
--------------------------------------------------------------------------------
Original (SigLIP/BLIP)         100.00%         100.00%         1.000     
VLM Staged                     100.00%         100.00%         1.000     
```

## Troubleshooting

### "FIREWORK_API_KEY not found"

Make sure you've set the environment variable:
```bash
export FIREWORK_API_KEY=your_key_here
```

Or add it to your `.env` file in the backend directory.

### "ML dependencies not installed" (Original matcher)

The original matcher requires heavy dependencies. Either:
1. Install them: `pip install torch transformers scikit-learn pytesseract`
2. Skip it: `python test_vlm_comparison.py --skip-original`

### Images too large / Token limit exceeded

Use downsampling:
```python
matcher = ImageTextMatcherVLM(max_image_dimension=512)
```

Or in test script:
```bash
python test_vlm_comparison.py --downsampling 512
```

## Cost Estimation

### VLM Staged (per image-text pair)
- ~3 API calls per pair
- Estimated: $0.01-0.05 per pair (depends on image size and text length)
- Example: Matching 5 images to 3 summaries = 15 pairs × 3 calls = 45 API calls
- With caching: OCR and captions are cached per image, reducing redundant calls

**Cost optimization tips:**
- Downsample images to 1024px or 512px (50-75% cost reduction)
- Use caching effectively (automatic in implementation)
- Filter candidates by timestamp first to reduce pairs

## License

Part of the MiCRA project.


