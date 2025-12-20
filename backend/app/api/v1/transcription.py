from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import os
import tempfile
import traceback

import sys
from pathlib import Path

# 1. Get the path to the 'backend' folder
# Current file is in: backend/app/api/v1/transcription.py
# .parent = v1
# .parent.parent = api
# .parent.parent.parent = app
# .parent.parent.parent.parent = backend
backend_root = Path(__file__).resolve().parent.parent.parent.parent

# 2. Add 'backend' to sys.path so Python can find 'audio_transcription'
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

# 3. Now import cleanly
from audio_transcription.audio_transcription import download_audio, transcribe_audio_or_video_file

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

@router.post("/", response_model=TranscriptionResponse)
async def transcribe_url(request: TranscriptionRequest):
    file_path = None
    try:
        # 1. Validate and Download
        if not request.url or not request.url.strip():
            raise HTTPException(status_code=400, detail="URL cannot be empty")

        url = request.url.strip()
        print(f"Downloading audio from URL: {url}")
        file_path = download_audio(url)

        if not file_path:
            raise HTTPException(status_code=500, detail="Failed to download audio")

        # 2. TRANSCRIBE USING FIREWORK API
        print(f"Transcribing audio file: {file_path}")
        segments = transcribe_audio_or_video_file(file_path)

        if segments is None:
            raise HTTPException(status_code=500, detail="Failed to transcribe audio file")

        # 4. Format Response
        transcription_segments = [
            TranscriptionSegment(start=seg["start"], end=seg["end"], text=seg["text"])
            for seg in segments
        ]

        return TranscriptionResponse(
            success=True,
            segments=transcription_segments,
            message="Transcription completed successfully"
        )

    except Exception as e:
        print(f"Error: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass

@router.post("/upload", response_model=TranscriptionResponse)
async def transcribe_file(file: UploadFile = File(...)):
    file_path = None
    try:
        # 1. Save File
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        file_extension = os.path.splitext(file.filename)[1] or '.tmp'
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            file_path = temp_file.name
            content = await file.read()
            temp_file.write(content)
        
        # 2. TRANSCRIBE USING FIREWORK API
        print(f"Transcribing uploaded file: {file_path}")
        segments = transcribe_audio_or_video_file(file_path)
        
        if segments is None:
            raise HTTPException(status_code=500, detail="Failed to transcribe audio file")
        
        # 4. Format Response
        transcription_segments = [
            TranscriptionSegment(start=seg["start"], end=seg["end"], text=seg["text"])
            for seg in segments
        ]
        
        return TranscriptionResponse(
            success=True,
            segments=transcription_segments,
            message="Transcription completed successfully"
        )
        
    except Exception as e:
        print(f"Error: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass