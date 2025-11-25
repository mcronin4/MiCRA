# This file contains the transcription API endpoint for processing video/audio URLs

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import sys
import os
import tempfile
from pathlib import Path

# Add the backend root directory to the path to import audio_transcription
backend_root = Path(__file__).parent.parent.parent.parent
backend_root_str = str(backend_root.resolve())
if backend_root_str not in sys.path:
    sys.path.insert(0, backend_root_str)

# Import after path is set up
try:
    from audio_transcription.audio_transcription import download_audio, transcribe_audio_or_video_file
except ImportError as e:
    print(
        f"Failed to import audio_transcription module. Backend root: {backend_root_str}")
    print(f"Import error: {e}")
    print(f"Current sys.path: {sys.path[:3]}")  # Print first 3 entries
    raise

router = APIRouter(prefix="/transcription")


class TranscriptionRequest(BaseModel):
    url: str


class TranscriptionSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptionResponse(BaseModel):
    success: bool
    segments: Optional[List[TranscriptionSegment]] = None
    error: Optional[str] = None
    message: Optional[str] = None


@router.post("/", response_model=TranscriptionResponse, status_code=200)
async def transcribe_url(request: TranscriptionRequest):
    """
    Transcribe audio/video from a URL.
    Downloads the media, transcribes it, and returns the transcription segments.
    """
    file_path = None
    try:
        # Validate URL
        if not request.url or not request.url.strip():
            raise HTTPException(status_code=400, detail="URL cannot be empty")

        url = request.url.strip()

        # Download audio from URL
        print(f"Downloading audio from URL: {url}")
        file_path = download_audio(url)

        if not file_path:
            raise HTTPException(
                status_code=500, detail="Failed to download audio from URL")

        # Transcribe the audio file
        print(f"Transcribing audio file: {file_path}")
        segments = transcribe_audio_or_video_file(file_path)

        if segments is None:
            raise HTTPException(
                status_code=500, detail="Failed to transcribe audio file")

        # Convert to response format
        transcription_segments = [
            TranscriptionSegment(
                start=seg["start"],
                end=seg["end"],
                text=seg["text"]
            )
            for seg in segments
        ]

        return TranscriptionResponse(
            success=True,
            segments=transcription_segments,
            message="Transcription completed successfully"
        )

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error processing transcription: {str(e)}"
        error_traceback = traceback.format_exc()
        print(f"Transcription error: {error_msg}")
        print(f"Traceback: {error_traceback}")
        # Return error response instead of raising to provide more details
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {error_msg}"
        )
    finally:
        # Clean up downloaded file
        if file_path:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Temporary file removed: {file_path}")
            except Exception as e:
                print(f"Could not remove temporary file {file_path}: {e}")


@router.post("/upload", response_model=TranscriptionResponse, status_code=200)
async def transcribe_file(file: UploadFile = File(...)):
    """
    Transcribe audio/video from an uploaded file.
    Accepts the file, saves it temporarily, transcribes it, and returns the transcription segments.
    """
    file_path = None
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Create a temporary file to save the uploaded file
        file_extension = os.path.splitext(file.filename)[1] or '.tmp'
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_extension)
        file_path = temp_file.name
        temp_file.close()
        
        # Save uploaded file to temporary location
        print(f"Saving uploaded file to: {file_path}")
        with open(file_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        # Transcribe the audio file
        print(f"Transcribing audio file: {file_path}")
        segments = transcribe_audio_or_video_file(file_path)
        
        if segments is None:
            raise HTTPException(
                status_code=500, detail="Failed to transcribe audio file")
        
        # Convert to response format
        transcription_segments = [
            TranscriptionSegment(
                start=seg["start"],
                end=seg["end"],
                text=seg["text"]
            )
            for seg in segments
        ]
        
        return TranscriptionResponse(
            success=True,
            segments=transcription_segments,
            message="Transcription completed successfully"
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error processing transcription: {str(e)}"
        error_traceback = traceback.format_exc()
        print(f"Transcription error: {error_msg}")
        print(f"Traceback: {error_traceback}")
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {error_msg}"
        )
    finally:
        # Clean up uploaded file
        if file_path:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Temporary file removed: {file_path}")
            except Exception as e:
                print(f"Could not remove temporary file {file_path}: {e}")
