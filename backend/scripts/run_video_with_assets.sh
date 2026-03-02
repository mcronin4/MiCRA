#!/usr/bin/env bash
# --------------------------------------------------------------------------
# run_video_with_assets.sh
#
# Registers local assets, then runs VideoGeneration via Veo.
# Each run writes generated artifacts to .artifacts/run_<timestamp>/
#
# All parameters are configurable via CLI flags. Defaults are the
# cheapest options (4s / 720p / 9:16).
#
# Usage:
#   # Dry run with defaults:
#   bash backend/scripts/run_video_with_assets.sh
#
#   # Custom prompt, 8s duration, landscape:
#   bash backend/scripts/run_video_with_assets.sh \
#       --prompt "A sunset over the ocean" \
#       --duration 8 \
#       --aspect-ratio 16:9
#
#   # Use only specific images:
#   bash backend/scripts/run_video_with_assets.sh \
#       --images "000010.JPG 000016.JPG"
#
#   # Use a different transcript file:
#   bash backend/scripts/run_video_with_assets.sh \
#       --transcript /path/to/my_script.txt
#
#   # Skip images entirely (prompt-only generation):
#   bash backend/scripts/run_video_with_assets.sh --no-images
#
#   # Skip transcript even if file exists:
#   bash backend/scripts/run_video_with_assets.sh --no-transcript
#
#   # Full live example:
#   VEO_ENABLE_LIVE_CALLS=true \
#   GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa-key.json" \
#   bash backend/scripts/run_video_with_assets.sh \
#       --prompt "Cinematic drone shot of mountains at golden hour" \
#       --duration 8 \
#       --resolution 1080p \
#       --aspect-ratio 16:9 \
#       --negative-prompt "cartoon, low quality, blurry" \
#       --transcript ./local_test_assets/transcript.txt \
#       --images "000010.JPG 000030.JPG"
# --------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# ==========================================================================
# Defaults (cheapest Veo options)
# ==========================================================================
ASSETS_DIR="$REPO_ROOT/local_test_assets"
PROMPT="Create a cinematic marketing-style video that smoothly transitions through the three uploaded images. Start with a clean animated title card introducing the destination. Add short, elegant marketing captions to each image. Use smooth zoom or parallax motion, warm travel-style color grading, and seamless transitions."
DURATION="8"
RESOLUTION="720p"
ASPECT_RATIO="9:16"
NEGATIVE_PROMPT="Voiceover, watermarks, distorted or unreadable text, animate image."
TRANSCRIPT_FILE="$ASSETS_DIR/transcript.txt"
IMAGE_FILTER=""          # empty = use all images in ASSETS_DIR
USE_IMAGES=true
USE_TRANSCRIPT=false

# ==========================================================================
# Parse CLI arguments
# ==========================================================================
while [[ $# -gt 0 ]]; do
    case "$1" in
        --prompt)
            PROMPT="$2"; shift 2 ;;
        --duration)
            DURATION="$2"; shift 2 ;;
        --resolution)
            RESOLUTION="$2"; shift 2 ;;
        --aspect-ratio)
            ASPECT_RATIO="$2"; shift 2 ;;
        --negative-prompt)
            NEGATIVE_PROMPT="$2"; shift 2 ;;
        --transcript)
            TRANSCRIPT_FILE="$2"; shift 2 ;;
        --no-transcript)
            USE_TRANSCRIPT=false; shift ;;
        --images)
            IMAGE_FILTER="$2"; shift 2 ;;
        --no-images)
            USE_IMAGES=false; shift ;;
        --assets-dir)
            ASSETS_DIR="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,/^# ----/p' "$0" | head -n -1 | sed 's/^# \?//'
            exit 0 ;;
        *)
            echo "Unknown option: $1 (use --help for usage)"
            exit 1 ;;
    esac
done

ARTIFACTS_ROOT="$REPO_ROOT/.artifacts"
export ARTIFACT_BACKEND=local

# ------------------------------------------------------------------
# Print config
# ------------------------------------------------------------------
echo "==========================================================="
echo "  VIDEO GENERATION CONFIG"
echo "==========================================================="
echo "  Prompt:          ${PROMPT:-"(default)"}"
echo "  Duration:        ${DURATION}s"
echo "  Resolution:      $RESOLUTION"
echo "  Aspect ratio:    $ASPECT_RATIO"
echo "  Negative prompt: ${NEGATIVE_PROMPT:-"(none)"}"
echo "  Transcript:      $(if $USE_TRANSCRIPT; then echo "$TRANSCRIPT_FILE"; else echo "(skipped)"; fi)"
echo "  Images:          $(if $USE_IMAGES; then echo "${IMAGE_FILTER:-"all in $ASSETS_DIR"}"; else echo "(skipped)"; fi)"
echo "  Assets dir:      $ASSETS_DIR"
echo "==========================================================="
echo

# ------------------------------------------------------------------
# Step 1: Register local assets into the artifact store (root)
# ------------------------------------------------------------------
unset ARTIFACTS_RUN_ID 2>/dev/null || true

echo "=== Step 1: Registering local test assets ==="
REGISTER_OUTPUT=$(python "$REPO_ROOT/backend/scripts/dev_register_assets.py" 2>&1)
echo "$REGISTER_OUTPUT"
echo

# ------------------------------------------------------------------
# Step 2: Extract image artifact IDs
# ------------------------------------------------------------------
IMAGE_IDS=""

if $USE_IMAGES; then
    JSON_BLOCK=$(echo "$REGISTER_OUTPUT" | sed -n '/^{$/,/^}$/p')

    if [ -z "$JSON_BLOCK" ]; then
        echo "ERROR: Could not parse artifact mapping from register script output."
        exit 1
    fi

    IMAGE_IDS=$(echo "$JSON_BLOCK" \
        | python -c "
import sys, json
mapping = json.load(sys.stdin)
# Filter: only image files (not .txt)
image_filter = '''$IMAGE_FILTER'''.strip()
if image_filter:
    # User specified filenames — pick only those
    wanted = set(image_filter.split())
    ids = [v for k, v in mapping.items() if k in wanted]
else:
    # Use all non-txt files
    ids = [v for k, v in mapping.items() if not k.lower().endswith('.txt')]
print(' '.join(ids))
")

    if [ -z "$IMAGE_IDS" ]; then
        echo "WARNING: No matching image artifacts found. Continuing without images."
    else
        echo "=== Step 2: Image artifact IDs ==="
        echo "$IMAGE_IDS"
    fi
else
    echo "=== Step 2: Images skipped (--no-images) ==="
fi
echo

# ------------------------------------------------------------------
# Step 3: Build the prompt
# ------------------------------------------------------------------
BASE_PROMPT="${PROMPT:-"Create a short, visually striking video with smooth camera motion and cinematic lighting."}"

if $USE_TRANSCRIPT && [ -f "$TRANSCRIPT_FILE" ] && [ -s "$TRANSCRIPT_FILE" ]; then
    TRANSCRIPT_CONTENT=$(<"$TRANSCRIPT_FILE")
    FINAL_PROMPT="${BASE_PROMPT}

Context from transcript:
${TRANSCRIPT_CONTENT}"
    echo "=== Step 3: Transcript loaded from $TRANSCRIPT_FILE ($(wc -c < "$TRANSCRIPT_FILE") bytes) ==="
else
    FINAL_PROMPT="$BASE_PROMPT"
    if ! $USE_TRANSCRIPT; then
        echo "=== Step 3: Transcript skipped (--no-transcript) ==="
    elif [ ! -f "$TRANSCRIPT_FILE" ]; then
        echo "=== Step 3: Transcript file not found: $TRANSCRIPT_FILE ==="
    else
        echo "=== Step 3: Transcript file is empty — using prompt only ==="
    fi
fi
echo

# ------------------------------------------------------------------
# Step 4: Run video generation into a per-run folder
# ------------------------------------------------------------------
RUN_ID="run_$(date +%Y-%m-%d_%H-%M-%S)"
export ARTIFACTS_RUN_ID="$RUN_ID"
RUN_DIR="$ARTIFACTS_ROOT/$RUN_ID"

echo "=== Step 4: Generating video ==="
echo "  Params:  duration=${DURATION}s  resolution=$RESOLUTION  aspect_ratio=$ASPECT_RATIO"
echo "  Run dir: $RUN_DIR"
echo

CMD=(
    python "$REPO_ROOT/backend/scripts/dev_run_generate_video.py"
    --prompt "$FINAL_PROMPT"
    --duration "$DURATION"
    --resolution "$RESOLUTION"
    --aspect-ratio "$ASPECT_RATIO"
)

if [ -n "$NEGATIVE_PROMPT" ]; then
    CMD+=(--negative-prompt "$NEGATIVE_PROMPT")
fi

if [ -n "$IMAGE_IDS" ]; then
    # shellcheck disable=SC2086
    CMD+=(--images $IMAGE_IDS)
fi

"${CMD[@]}"

# ------------------------------------------------------------------
# Step 5: Summary
# ------------------------------------------------------------------
echo
echo "==========================================================="
echo "  RUN COMPLETE: $RUN_ID"
echo "==========================================================="

if [ -d "$RUN_DIR" ]; then
    echo
    echo "  Output folder: $RUN_DIR"
    echo "  -----------------------------------------------------------"

    VIDEO_FILE=$(find "$RUN_DIR" -name "*.mp4" -type f 2>/dev/null | head -1)
    if [ -n "$VIDEO_FILE" ]; then
        VIDEO_SIZE=$(stat --printf="%s" "$VIDEO_FILE" 2>/dev/null || stat -f%z "$VIDEO_FILE" 2>/dev/null || echo "?")
        echo "  VIDEO: $VIDEO_FILE"
        echo "         ($VIDEO_SIZE bytes)"
    else
        echo "  VIDEO: (none — check errors above)"
    fi

    echo
    echo "  All files in run folder:"
    for f in "$RUN_DIR"/*; do
        [ -f "$f" ] || continue
        FNAME=$(basename "$f")
        FSIZE=$(stat --printf="%s" "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo "?")
        echo "    $FNAME  ($FSIZE bytes)"
    done
    echo "==========================================================="
else
    echo
    echo "  (No run folder created — workflow may have failed)"
    echo "==========================================================="
fi
