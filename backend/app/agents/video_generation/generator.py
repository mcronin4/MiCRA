"""
Veo 3.1 video generation via the google-genai SDK.

Uses the same SDK already used for image generation (google.genai).
Supports two auth modes:
  1. GEMINI_API_KEY  — Gemini API (simpler, recommended)
  2. GOOGLE_APPLICATION_CREDENTIALS — Vertex AI service-account

Live calls are gated by VEO_ENABLE_LIVE_CALLS=true (default false).
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MODEL = "veo-3.1-generate-preview"

# Polling config
_POLL_INTERVAL_SEC = 10
_MAX_POLL_SEC = 300  # 5 minutes

# Valid parameter values per the official API
_VALID_DURATIONS = ("4", "6", "8")
_VALID_ASPECT_RATIOS = ("16:9", "9:16")
_VALID_RESOLUTIONS = ("720p", "1080p", "4k")


def _build_client():
    """
    Build a google.genai.Client with the best available auth.

    Priority:
      1. GOOGLE_APPLICATION_CREDENTIALS → Vertex AI mode
      2. GEMINI_API_KEY → Gemini API mode
    """
    from google import genai

    sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    api_key = os.getenv("GEMINI_API_KEY")

    if sa_path:
        # Vertex AI mode with service-account credentials
        project = os.getenv("GOOGLE_CLOUD_PROJECT", "core-avenue-488216-t2")
        location = os.getenv("VERTEX_AI_LOCATION", "us-central1")
        logger.info(
            "Using Vertex AI auth (project=%s, location=%s, creds=%s)",
            project, location, sa_path,
        )
        return genai.Client(
            vertexai=True,
            project=project,
            location=location,
        )
    elif api_key:
        logger.info("Using Gemini API key auth")
        return genai.Client(api_key=api_key)
    else:
        raise RuntimeError(
            "No auth configured. Set either GOOGLE_APPLICATION_CREDENTIALS "
            "(service-account JSON path) or GEMINI_API_KEY."
        )


def _is_live() -> bool:
    return os.getenv("VEO_ENABLE_LIVE_CALLS", "").lower() in ("true", "1", "yes")


def generate_video_with_veo(
    prompt: str,
    images: list[bytes] | None = None,
    params: dict[str, Any] | None = None,
) -> bytes:
    """
    Generate an MP4 video via Veo 3.1.

    Args:
        prompt: Text prompt describing the video to generate.
        images: Optional list of image bytes. If provided, the first image
                is used as a reference frame for image-to-video generation.
        params: Optional dict with keys:
            - duration_seconds (str): "4", "6", or "8" (default "8")
            - aspect_ratio (str): "16:9" or "9:16" (default "9:16")
            - resolution (str): "720p", "1080p", or "4k" (default "720p")
            - negative_prompt (str): text describing unwanted content

    Returns:
        Raw MP4 bytes.

    Raises:
        RuntimeError on API error, timeout, or if live calls are disabled.
    """
    if not _is_live():
        raise RuntimeError(
            "VEO_ENABLE_LIVE_CALLS is not enabled. "
            "Set VEO_ENABLE_LIVE_CALLS=true to make real Veo API calls."
        )

    from google.genai import types

    params = params or {}

    # Validate and normalize parameters
    duration = str(params.get("duration_seconds", "8"))
    if duration not in _VALID_DURATIONS:
        duration = "8"

    aspect_ratio = params.get("aspect_ratio", "9:16")
    if aspect_ratio not in _VALID_ASPECT_RATIOS:
        aspect_ratio = "9:16"

    resolution = params.get("resolution", "720p")
    if resolution not in _VALID_RESOLUTIONS:
        resolution = "720p"

    negative_prompt = params.get("negative_prompt")

    # Build config
    config_kwargs: dict[str, Any] = {
        "aspect_ratio": aspect_ratio,
        "duration_seconds": duration,
        "resolution": resolution,
    }
    if negative_prompt:
        config_kwargs["negative_prompt"] = negative_prompt

    config = types.GenerateVideosConfig(**config_kwargs)

    client = _build_client()

    # Build the generate_videos call
    call_kwargs: dict[str, Any] = {
        "model": MODEL,
        "prompt": prompt,
        "config": config,
    }

    # Image-to-video: attach reference image
    if images and len(images) > 0:
        image_part = types.Image(image_bytes=images[0], mime_type="image/jpeg")
        call_kwargs["image"] = image_part

    logger.info(
        "Submitting Veo generation (duration=%ss, ar=%s, res=%s)",
        duration, aspect_ratio, resolution,
    )

    operation = client.models.generate_videos(**call_kwargs)

    # Poll for completion
    elapsed = 0.0
    logger.info("Waiting for Veo to generate video (timeout %ds)...", _MAX_POLL_SEC)
    while not operation.done:
        if elapsed >= _MAX_POLL_SEC:
            raise RuntimeError(f"Veo generation timed out after {_MAX_POLL_SEC}s")
        time.sleep(_POLL_INTERVAL_SEC)
        elapsed += _POLL_INTERVAL_SEC
        logger.info("  Still generating... %ds / %ds", int(elapsed), _MAX_POLL_SEC)
        operation = client.operations.get(operation)

    logger.info("Veo generation complete! (%.0fs elapsed)", elapsed)

    # Extract video
    generated_videos = operation.response.generated_videos
    if not generated_videos:
        raise RuntimeError("Veo returned no generated videos")

    video_obj = generated_videos[0].video
    video_bytes: bytes | None = None

    # 1. Check if bytes are already on the object (Vertex AI mode)
    raw = getattr(video_obj, "video_bytes", None)
    if raw and isinstance(raw, bytes) and len(raw) > 0:
        logger.info("Video bytes available directly on response object")
        video_bytes = raw

    # 2. Try Gemini API download (only works in non-Vertex mode)
    if not video_bytes:
        try:
            client.files.download(file=video_obj)
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                video_obj.save(tmp_path)
                video_bytes = Path(tmp_path).read_bytes()
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
        except (ValueError, AttributeError):
            pass

    # 3. Try downloading from URI
    if not video_bytes:
        uri = getattr(video_obj, "uri", None)
        if uri:
            logger.info("Downloading video from URI: %s", uri[:120])
            import requests as _requests
            sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            headers = {}
            if sa_path:
                from google.oauth2 import service_account as _sa
                from google.auth.transport.requests import Request as _Req
                creds = _sa.Credentials.from_service_account_file(
                    sa_path,
                    scopes=["https://www.googleapis.com/auth/cloud-platform"],
                )
                creds.refresh(_Req())
                headers["Authorization"] = f"Bearer {creds.token}"
            dl_resp = _requests.get(uri, headers=headers, timeout=120)
            dl_resp.raise_for_status()
            video_bytes = dl_resp.content

    if not video_bytes:
        raise RuntimeError("Downloaded video file is empty")

    logger.info("Video downloaded: %d bytes", len(video_bytes))
    return video_bytes
