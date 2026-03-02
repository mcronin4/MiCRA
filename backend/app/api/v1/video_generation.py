"""
Video generation API endpoints.

Standalone endpoint for testing video generation outside the workflow engine.
Uses the same Veo 3.1 generator and preprocessing pipeline.
"""

import asyncio
import base64
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/video-generation", tags=["video-generation"])
logger = logging.getLogger(__name__)


class GenerateVideoRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    images: list[str] = Field(default_factory=list)  # Base64 encoded images
    text_context: str = ""
    duration_seconds: str = Field("8", pattern=r"^(4|6|8)$")
    aspect_ratio: str = Field("9:16", pattern=r"^(16:9|9:16)$")
    resolution: str = Field("720p", pattern=r"^(720p|1080p|4k)$")
    negative_prompt: str = ""
    video_style: str = ""  # "marketing", "slideshow", "product_demo", "tiktok", "cinematic", "documentary"


class GenerateVideoResponse(BaseModel):
    success: bool
    video_url: Optional[str] = None
    prompt_bundle: Optional[dict] = None
    error: Optional[str] = None


@router.post("/generate", response_model=GenerateVideoResponse)
async def generate_video(request: GenerateVideoRequest):
    """
    Generate a video using Veo 3.1 with optional preprocessing.

    - Accepts base64-encoded reference images (max 3 used)
    - Runs the preprocessing pipeline (image selection, analysis, prompt enhancement)
    - Returns a video URL (artifact path or data URL) and generation metadata
    """
    try:
        from app.agents.video_generation.generator import generate_video_with_veo
        from app.agents.video_generation.preprocessor import preprocess_video_inputs
        from app.storage.local_artifacts import is_local_backend, write_artifact

        # Decode images
        image_bytes_list: list[bytes] = []
        for img_b64 in request.images:
            try:
                # Handle data URLs
                if "," in img_b64:
                    _, encoded = img_b64.split(",", 1)
                else:
                    encoded = img_b64
                image_bytes_list.append(base64.b64decode(encoded))
            except Exception as e:
                logger.warning("Failed to decode image: %s", e)

        # Run preprocessing
        params = {
            "user_prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "video_style": request.video_style,
            "duration_seconds": request.duration_seconds,
            "aspect_ratio": request.aspect_ratio,
            "resolution": request.resolution,
        }
        inputs = {
            "text": request.text_context,
            "_image_bytes": image_bytes_list,
        }

        enhanced_prompt, selected_images, preprocess_meta = preprocess_video_inputs(
            params, inputs
        )

        # Build Veo params
        veo_params = {
            "duration_seconds": request.duration_seconds,
            "aspect_ratio": request.aspect_ratio,
            "resolution": request.resolution,
        }
        if request.negative_prompt:
            veo_params["negative_prompt"] = request.negative_prompt

        # Call Veo
        video_bytes = await asyncio.to_thread(
            generate_video_with_veo,
            prompt=enhanced_prompt,
            images=selected_images if selected_images else None,
            params=veo_params,
        )

        # Store artifact
        if is_local_backend():
            import json

            video_meta = write_artifact(
                data=video_bytes, mime="video/mp4", name="generated_video.mp4"
            )
            video_url = video_meta["path"]
        else:
            video_b64 = base64.b64encode(video_bytes).decode("ascii")
            video_url = f"data:video/mp4;base64,{video_b64}"

        prompt_bundle = {
            "enhanced_prompt": enhanced_prompt,
            "veo_params": veo_params,
            "preprocessing": preprocess_meta,
        }

        return GenerateVideoResponse(
            success=True,
            video_url=video_url,
            prompt_bundle=prompt_bundle,
        )

    except Exception as e:
        logger.exception("Video generation failed")
        raise HTTPException(status_code=500, detail=str(e))
