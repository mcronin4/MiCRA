from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path
import tempfile
import base64
import os
import asyncio
import traceback

from ...auth.dependencies import User, get_current_user
from ...db.supabase import get_supabase
from ...storage.r2 import get_r2, R2_BUCKET

# NOTE: image_extraction depends on optional heavy deps (opencv-python-headless, etc).
# To avoid crashing server startup when those aren't installed, we import lazily
# inside the execution path.

router = APIRouter(prefix="/image-extraction")


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
    max_frames: Optional[int] = None,
) -> Dict[str, Any]:
    output_dir = _get_output_dir()
    config: Dict[str, Any] = {"output_dir": str(output_dir)}

    if max_frames is not None:
        max_frames = max(1, min(int(max_frames), 200))
        config["max_total_frames"] = max_frames

    return config


async def _run_pipeline(
    video_path: str,
    *,
    max_frames: Optional[int] = None,
) -> Dict[str, Any]:
    config = _build_pipeline_config(
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


class ExtractFromFileIdRequest(BaseModel):
    file_id: str
    selection_mode: str = "auto"
    max_frames: Optional[int] = None


@router.post("/from-file", response_model=ImageExtractionResponse)
async def extract_keyframes_from_file_id(
    request: ExtractFromFileIdRequest,
    user: User = Depends(get_current_user),
):
    """Extract keyframes from a video already stored in R2, referenced by file ID."""
    supabase = get_supabase().client
    r2 = get_r2()

    result = supabase.table("files").select("*").eq("id", request.file_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="File not found")

    file_record = result.data[0]
    if file_record.get("user_id") != user.sub:
        raise HTTPException(status_code=403, detail="Not authorized")
    if file_record["status"] != "uploaded":
        raise HTTPException(status_code=400, detail="File not uploaded yet")

    r2_path = file_record["path"]
    ext = os.path.splitext(file_record.get("name", ""))[1] or ".mp4"
    video_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            video_path = tmp.name

        await asyncio.to_thread(
            r2.client.download_file, R2_BUCKET, r2_path, video_path
        )

        max_frames = request.max_frames if request.selection_mode == "manual" else None
        pipeline_result = await _run_pipeline(video_path, max_frames=max_frames)
        return _build_response(pipeline_result)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Image extraction error (from-file): {exc}")
        print(traceback.format_exc())
        return ImageExtractionResponse(success=False, error=str(exc))
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except Exception:
                pass
