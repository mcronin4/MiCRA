from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path
import tempfile
import base64
import os
import asyncio
import traceback
from typing import Literal

# NOTE: image_extraction depends on optional heavy deps (opencv-python-headless, etc).
# To avoid crashing server startup when those aren't installed, we import lazily
# inside the execution path.

router = APIRouter(prefix="/image-extraction")


class ImageExtractionRequest(BaseModel):
    url: str
    keep_video: Optional[bool] = False
    selection_mode: Literal["auto", "manual"] = "auto"
    max_frames: Optional[int] = None


class ExtractedImage(BaseModel):
    id: str
    filename: str
    base64: str
    timestamp: Optional[float] = None


class ImageExtractionResponse(BaseModel):
    success: bool
    output_dir: Optional[str] = None
    selected_frames: Optional[List[Dict[str, Any]]] = None
    selected_images: Optional[List[ExtractedImage]] = None
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
    output_dir = app_root / "agents" / "image_extraction" / "outputs" / "keyframes"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _build_pipeline_config(
    *,
    selection_mode: str = "auto",
    max_frames: Optional[int] = None,
) -> Dict[str, Any]:
    output_dir = _get_output_dir()
    config: Dict[str, Any] = {"output_dir": str(output_dir)}

    mode = str(selection_mode or "auto").strip().lower()
    if mode == "manual":
        if max_frames is None:
            raise ValueError("max_frames is required when selection_mode is 'manual'")
        max_frames = max(1, min(int(max_frames), 200))
        config["max_total_frames"] = max_frames

    return config


async def _run_pipeline(
    video_path: str,
    *,
    selection_mode: str = "auto",
    max_frames: Optional[int] = None,
) -> Dict[str, Any]:
    config = _build_pipeline_config(
        selection_mode=selection_mode,
        max_frames=max_frames,
    )
    from app.agents.image_extraction.keyframe_pipeline import run_keyframe_pipeline
    return await asyncio.to_thread(run_keyframe_pipeline, video_path, config)


def _build_response(result: Dict[str, Any]) -> ImageExtractionResponse:
    selected_frames = result.get("selected_frames", [])
    selected_images: List[ExtractedImage] = []

    for idx, frame in enumerate(selected_frames):
        image_path = frame.get("selected_path") or frame.get("frame_path")
        if not image_path or not os.path.exists(image_path):
            continue

        filename = Path(image_path).name
        selected_images.append(
            ExtractedImage(
                id=f"frame-{idx}",
                filename=filename,
                base64=_image_to_data_url(image_path),
                timestamp=frame.get("timestamp"),
            )
        )

    return ImageExtractionResponse(
        success=True,
        output_dir=result.get("output_dir"),
        selected_frames=selected_frames,
        selected_images=selected_images,
        selected_json_path=result.get("selected_json"),
        stats=result.get("stats"),
    )


@router.post("", response_model=ImageExtractionResponse)
async def extract_keyframes_from_url(request: ImageExtractionRequest):
    video_path = None
    download_dir = None
    try:
        if not request.url or not request.url.strip():
            return ImageExtractionResponse(success=False, error="URL cannot be empty")

        download_dir = tempfile.mkdtemp(prefix="micra_image_extraction_")
        try:
            from app.agents.image_extraction.scene_detection import download_youtube_video
        except ImportError as exc:
            return ImageExtractionResponse(
                success=False,
                error=f"yt-dlp is required for YouTube downloads: {exc}"
            )

        video_path = download_youtube_video(request.url.strip(), output_dir=download_dir)
        result = await _run_pipeline(
            video_path,
            selection_mode=request.selection_mode,
            max_frames=request.max_frames,
        )
        return _build_response(result)
    except Exception as exc:
        print(f"Image extraction error: {exc}")
        print(traceback.format_exc())
        return ImageExtractionResponse(success=False, error=str(exc))
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


@router.post("/upload", response_model=ImageExtractionResponse)
async def extract_keyframes_from_file(
    file: UploadFile = File(...),
    selection_mode: str = Form("auto"),
    max_frames: Optional[int] = Form(None),
):
    video_path = None
    try:
        if not file.filename:
            return ImageExtractionResponse(success=False, error="No file provided")

        file_extension = os.path.splitext(file.filename)[1] or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            video_path = temp_file.name
            temp_file.write(await file.read())

        result = await _run_pipeline(
            video_path,
            selection_mode=selection_mode,
            max_frames=max_frames,
        )
        return _build_response(result)
    except Exception as exc:
        print(f"Image extraction error: {exc}")
        print(traceback.format_exc())
        return ImageExtractionResponse(success=False, error=str(exc))
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except Exception:
                pass
