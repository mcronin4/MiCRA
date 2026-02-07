"""
Image Extraction JB Edition API
Dense frame extraction with early deduplication and soft scoring.
"""

from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path
import tempfile
import base64
import os
import asyncio
import traceback

router = APIRouter(prefix="/image-extraction-jb")


class ImageExtractionJBRequest(BaseModel):
    url: str
    keep_video: Optional[bool] = False
    frame_interval: Optional[int] = 3
    max_final_frames: Optional[int] = 5  # Changed from 25 to 5 for Instagram-worthy picks
    temporal_buckets: Optional[int] = 5
    use_embedding_clustering: Optional[bool] = True  # NEW: SigLIP-based smart dedup
    embedding_similarity_threshold: Optional[float] = 0.85  # NEW: How similar = duplicate


class ExtractedImageJB(BaseModel):
    id: str
    filename: str
    base64: str
    timestamp: Optional[float] = None
    quality_score: Optional[float] = None


class ImageExtractionJBResponse(BaseModel):
    success: bool
    output_dir: Optional[str] = None
    selected_frames: Optional[List[Dict[str, Any]]] = None
    selected_images: Optional[List[ExtractedImageJB]] = None
    selected_json_path: Optional[str] = None
    stats: Optional[Dict[str, int]] = None
    error: Optional[str] = None


def _image_to_data_url(image_path: str) -> str:
    suffix = Path(image_path).suffix.lower().lstrip(".")
    if suffix in ("jpg", "jpeg"):
        mime = "image/jpeg"
    elif suffix in ("png", "webp"):
        mime = f"image/{suffix}"
    else:
        mime = "image/jpeg"

    with open(image_path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _get_output_dir() -> Path:
    app_root = Path(__file__).resolve().parent.parent.parent
    output_dir = app_root / "agents" / "image_extraction" / "outputs" / "keyframes_jb"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


async def _run_pipeline_jb(
    video_path: str,
    frame_interval: int = 3,
    max_final_frames: int = 5,
    temporal_buckets: int = 5,
    use_embedding_clustering: bool = True,
    embedding_similarity_threshold: float = 0.85
) -> Dict[str, Any]:
    output_dir = _get_output_dir()
    config = {
        "output_dir": str(output_dir),
        "frame_interval": frame_interval,
        "max_final_frames": max_final_frames,
        "temporal_buckets": temporal_buckets,
        "use_embedding_clustering": use_embedding_clustering,
        "embedding_similarity_threshold": embedding_similarity_threshold,
    }
    from app.agents.image_extraction.keyframe_pipeline_jb import run_keyframe_pipeline_jb
    return await asyncio.to_thread(run_keyframe_pipeline_jb, video_path, config)


def _build_response(result: Dict[str, Any]) -> ImageExtractionJBResponse:
    selected_frames = result.get("selected_frames", [])
    selected_images: List[ExtractedImageJB] = []

    for idx, frame in enumerate(selected_frames):
        image_path = frame.get("selected_path") or frame.get("frame_path")
        if not image_path or not os.path.exists(image_path):
            continue

        filename = Path(image_path).name
        selected_images.append(
            ExtractedImageJB(
                id=f"frame-{idx}",
                filename=filename,
                base64=_image_to_data_url(image_path),
                timestamp=frame.get("timestamp"),
                quality_score=frame.get("quality_score"),
            )
        )

    return ImageExtractionJBResponse(
        success=True,
        output_dir=result.get("output_dir"),
        selected_frames=selected_frames,
        selected_images=selected_images,
        selected_json_path=result.get("selected_json"),
        stats=result.get("stats"),
    )


@router.post("", response_model=ImageExtractionJBResponse)
async def extract_keyframes_jb_from_url(request: ImageExtractionJBRequest):
    """Extract keyframes using JB edition pipeline from YouTube URL."""
    video_path = None
    download_dir = None
    try:
        if not request.url or not request.url.strip():
            return ImageExtractionJBResponse(success=False, error="URL cannot be empty")

        download_dir = tempfile.mkdtemp(prefix="micra_image_extraction_jb_")
        try:
            from app.agents.image_extraction.scene_detection import download_youtube_video
        except ImportError as exc:
            return ImageExtractionJBResponse(
                success=False,
                error=f"yt-dlp is required for YouTube downloads: {exc}"
            )

        video_path = download_youtube_video(request.url.strip(), output_dir=download_dir)
        result = await _run_pipeline_jb(
            video_path,
            frame_interval=request.frame_interval or 3,
            max_final_frames=request.max_final_frames or 5,
            temporal_buckets=request.temporal_buckets or 5,
            use_embedding_clustering=request.use_embedding_clustering if request.use_embedding_clustering is not None else True,
            embedding_similarity_threshold=request.embedding_similarity_threshold or 0.85
        )
        return _build_response(result)
    except Exception as exc:
        print(f"Image extraction JB error: {exc}")
        print(traceback.format_exc())
        return ImageExtractionJBResponse(success=False, error=str(exc))
    finally:
        if video_path and not request.keep_video and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except Exception:
                pass
        if download_dir:
            try:
                os.rmdir(download_dir)
            except Exception:
                pass


@router.post("/upload", response_model=ImageExtractionJBResponse)
async def extract_keyframes_jb_from_file(
    file: UploadFile = File(...),
    frame_interval: int = Form(3),
    max_final_frames: int = Form(5),
    temporal_buckets: int = Form(5),
    use_embedding_clustering: bool = Form(True),
    embedding_similarity_threshold: float = Form(0.85)
):
    """Extract keyframes using JB edition v2 pipeline from uploaded file.

    Now with SigLIP embedding-based clustering for smarter deduplication
    and Instagram-worthiness scoring for better frame selection.
    """
    video_path = None
    try:
        if not file.filename:
            return ImageExtractionJBResponse(success=False, error="No file provided")

        file_extension = os.path.splitext(file.filename)[1] or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            video_path = temp_file.name
            temp_file.write(await file.read())

        result = await _run_pipeline_jb(
            video_path,
            frame_interval=frame_interval,
            max_final_frames=max_final_frames,
            temporal_buckets=temporal_buckets,
            use_embedding_clustering=use_embedding_clustering,
            embedding_similarity_threshold=embedding_similarity_threshold
        )
        return _build_response(result)
    except Exception as exc:
        print(f"Image extraction JB error: {exc}")
        print(traceback.format_exc())
        return ImageExtractionJBResponse(success=False, error=str(exc))
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except Exception:
                pass
