from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.auth.dependencies import User, get_current_user
from app.services.gradium_voice import (
    GradiumVoiceError,
    infer_stt_input_format,
    synthesize_speech_bytes,
    transcribe_audio_bytes,
)

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/voice", tags=["voice"])


class VoiceTranscriptionResponse(BaseModel):
    text: str
    input_format: str
    segments: int = 0


class VoiceSynthesisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    voice_id: str | None = None
    output_format: str = Field(default="wav")
    model_name: str | None = None


@router.post("/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    _ = user
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    input_format = infer_stt_input_format(file.content_type, file.filename)
    logger.info(
        "MicrAI voice transcribe request | filename=%s content_type=%s bytes=%s input_format=%s",
        file.filename,
        file.content_type,
        len(audio_bytes),
        input_format,
    )
    try:
        result = await transcribe_audio_bytes(
            audio_bytes,
            input_format=input_format,
        )
    except GradiumVoiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    logger.info(
        "MicrAI voice transcribe result | segments=%s text_len=%s",
        int(result.get("segments") or 0),
        len(str(result.get("text") or "")),
    )
    return VoiceTranscriptionResponse(
        text=str(result.get("text") or ""),
        input_format=input_format,
        segments=int(result.get("segments") or 0),
    )


@router.post("/tts")
async def synthesize_voice(
    request: VoiceSynthesisRequest,
    user: User = Depends(get_current_user),
):
    _ = user
    try:
        audio_bytes, media_type = await synthesize_speech_bytes(
            text=request.text,
            voice_id=request.voice_id,
            output_format=request.output_format,
            model_name=request.model_name,
        )
    except GradiumVoiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=audio_bytes, media_type=media_type)
