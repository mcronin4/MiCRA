#!/usr/bin/env bash
# --------------------------------------------------------------------------
# run_video_with_assets.sh
#
# 1. Registers images + text from local_test_assets/ into the local artifact store
# 2. Reads transcript.txt content and folds it into the prompt
# 3. Runs VideoGeneration with the cheapest Veo params:
#      duration=4s, resolution=720p, aspect_ratio=9:16
#
# Usage:
#   # Dry run (VEO_ENABLE_LIVE_CALLS defaults to false):
#   bash backend/scripts/run_video_with_assets.sh
#
#   # Live Veo call:
#   VEO_ENABLE_LIVE_CALLS=true \
#   GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa-key.json" \
#   bash backend/scripts/run_video_with_assets.sh
# --------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ASSETS_DIR="$REPO_ROOT/local_test_assets"
TRANSCRIPT="$ASSETS_DIR/transcript.txt"

export ARTIFACT_BACKEND=local

# ------------------------------------------------------------------
# Step 1: Register local_test_assets into the local artifact store
# ------------------------------------------------------------------
echo "=== Registering local test assets ==="
REGISTER_OUTPUT=$(python "$REPO_ROOT/backend/scripts/dev_register_assets.py" 2>&1)
echo "$REGISTER_OUTPUT"
echo

# ------------------------------------------------------------------
# Step 2: Extract image artifact IDs (skip .txt artifacts)
# ------------------------------------------------------------------
# The register script prints JSON mapping at the end. Extract it.
JSON_BLOCK=$(echo "$REGISTER_OUTPUT" | sed -n '/^{$/,/^}$/p')

if [ -z "$JSON_BLOCK" ]; then
    echo "ERROR: Could not parse artifact mapping from register script output."
    exit 1
fi

# Pull out artifact IDs for image files only (.JPG/.jpg/.png/.webp)
IMAGE_IDS=$(echo "$JSON_BLOCK" \
    | python -c "
import sys, json
mapping = json.load(sys.stdin)
ids = [v for k, v in mapping.items() if not k.lower().endswith('.txt')]
print(' '.join(ids))
")

if [ -z "$IMAGE_IDS" ]; then
    echo "ERROR: No image artifacts found."
    exit 1
fi

echo "=== Image artifact IDs ==="
echo "$IMAGE_IDS"
echo

# ------------------------------------------------------------------
# Step 3: Read transcript (if non-empty) and build the prompt
# ------------------------------------------------------------------
BASE_PROMPT="Create a short, visually striking video with smooth camera motion and cinematic lighting."

if [ -s "$TRANSCRIPT" ]; then
    TRANSCRIPT_CONTENT=$(<"$TRANSCRIPT")
    PROMPT="${BASE_PROMPT}

Context from transcript:
${TRANSCRIPT_CONTENT}"
    echo "=== Transcript loaded ($(wc -c < "$TRANSCRIPT") bytes) ==="
else
    PROMPT="$BASE_PROMPT"
    echo "=== transcript.txt is empty — using prompt only ==="
fi
echo

# ------------------------------------------------------------------
# Step 4: Run video generation with cheapest params
#   duration  = 4s   (shortest)
#   resolution = 720p (lowest)
#   aspect_ratio = 9:16 (default)
# ------------------------------------------------------------------
echo "=== Running video generation (cheapest: 4s / 720p / 9:16) ==="
echo

# shellcheck disable=SC2086
python "$REPO_ROOT/backend/scripts/dev_run_generate_video.py" \
    --prompt "$PROMPT" \
    --duration 4 \
    --resolution 720p \
    --aspect-ratio "9:16" \
    --images $IMAGE_IDS
