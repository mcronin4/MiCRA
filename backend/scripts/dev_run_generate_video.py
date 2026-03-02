#!/usr/bin/env python3
"""
Run a minimal workflow ending with a VideoGeneration node.

Usage:
    # Dry run (VEO_ENABLE_LIVE_CALLS defaults to false — will show what WOULD happen):
    ARTIFACT_BACKEND=local python backend/scripts/dev_run_generate_video.py

    # Live Veo call:
    ARTIFACT_BACKEND=local \
    VEO_ENABLE_LIVE_CALLS=true \
    GOOGLE_APPLICATION_CREDENTIALS="/c/keys/core-avenue-488216-t2-595efd63eb1e.json" \
    python backend/scripts/dev_run_generate_video.py

    # With specific options:
    ... python backend/scripts/dev_run_generate_video.py \
        --prompt "A cinematic drone shot of a sunset over mountains" \
        --duration 8 \
        --aspect-ratio 16:9 \
        --resolution 1080p \
        --images artifact_id_1 artifact_id_2

The script builds a single-node Blueprint (VideoGeneration) and runs
the workflow executor.  If ARTIFACT_BACKEND=local, outputs land in .artifacts/.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# Ensure backend is on sys.path
_backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend))

os.environ.setdefault("ARTIFACT_BACKEND", "local")

# Configure logging so progress messages are visible
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

from app.models.blueprint import (
    Blueprint,
    BlueprintNode,
    BlueprintConnection,
    WorkflowOutput,
)
from app.services.workflow_executor import execute_workflow


def build_blueprint(
    prompt: str,
    duration_seconds: str,
    aspect_ratio: str,
    resolution: str,
    negative_prompt: str,
    image_artifact_ids: list[str] | None = None,
) -> Blueprint:
    """Build a minimal single-node VideoGeneration Blueprint."""

    params = {
        "duration_seconds": duration_seconds,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "user_prompt": prompt,
    }
    if negative_prompt:
        params["negative_prompt"] = negative_prompt
    if image_artifact_ids:
        params["image_artifact_ids"] = image_artifact_ids

    video_node = BlueprintNode(
        node_id="video-gen-1",
        type="VideoGeneration",
        params=params,
    )

    return Blueprint(
        workflow_id="dev-video-gen",
        name="Dev Video Generation",
        nodes=[video_node],
        connections=[],
        execution_order=["video-gen-1"],
        workflow_outputs=[
            WorkflowOutput(
                key="video", from_node="video-gen-1", from_output="generated_video"
            ),
            WorkflowOutput(
                key="bundle", from_node="video-gen-1", from_output="prompt_bundle"
            ),
        ],
    )


async def run(args: argparse.Namespace):
    bp = build_blueprint(
        prompt=args.prompt,
        duration_seconds=args.duration,
        aspect_ratio=args.aspect_ratio,
        resolution=args.resolution,
        negative_prompt=args.negative_prompt or "",
        image_artifact_ids=args.images or None,
    )

    print("=== Blueprint ===")
    print(json.dumps(bp.model_dump(mode="json"), indent=2, default=str))
    print()

    veo_live = os.getenv("VEO_ENABLE_LIVE_CALLS", "false").lower() in ("true", "1", "yes")
    if not veo_live:
        print("VEO_ENABLE_LIVE_CALLS is not set. The executor WILL raise an error.")
        print("Set VEO_ENABLE_LIVE_CALLS=true to make a real Veo call.\n")

    print("=== Running workflow ===")
    result = await execute_workflow(bp)

    print()
    print(f"Success: {result.success}")
    print(f"Time: {result.total_execution_time_ms} ms")

    if result.error:
        print(f"Error: {result.error}")

    for nr in result.node_results:
        print(f"\n  Node {nr.node_id} ({nr.node_type}): {nr.status} ({nr.execution_time_ms}ms)")
        if nr.error:
            print(f"    Error: {nr.error}")
        if nr.outputs:
            for k, v in nr.outputs.items():
                if isinstance(v, str) and len(v) > 200:
                    print(f"    {k}: {v[:100]}... ({len(v)} chars)")
                elif isinstance(v, dict):
                    print(f"    {k}: {json.dumps(v, indent=4, default=str)}")
                else:
                    print(f"    {k}: {v}")

    if result.workflow_outputs:
        print("\n=== Workflow Outputs ===")
        for k, v in result.workflow_outputs.items():
            if isinstance(v, str) and len(v) > 200:
                print(f"  {k}: {v[:100]}... ({len(v)} chars)")
            elif isinstance(v, dict):
                print(f"  {k}:")
                print(json.dumps(v, indent=4, default=str))
            else:
                print(f"  {k}: {v}")


def main():
    parser = argparse.ArgumentParser(description="Dev: run VideoGeneration workflow")
    parser.add_argument(
        "--prompt",
        default="Create a short, visually striking video with smooth camera motion and cinematic lighting.",
        help="User prompt for video generation",
    )
    parser.add_argument(
        "--duration", default="8",
        choices=["4", "6", "8"],
        help="Duration in seconds: 4, 6, or 8 (default: 8)",
    )
    parser.add_argument(
        "--aspect-ratio", default="9:16",
        choices=["9:16", "16:9"],
        help="Aspect ratio (default: 9:16)",
    )
    parser.add_argument(
        "--resolution", default="720p",
        choices=["720p", "1080p", "4k"],
        help="Video resolution (default: 720p)",
    )
    parser.add_argument(
        "--negative-prompt", default=None,
        help="Describe unwanted content (e.g. 'cartoon, low quality')",
    )
    parser.add_argument("--images", nargs="*", help="Local artifact IDs for reference images")
    args = parser.parse_args()

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
