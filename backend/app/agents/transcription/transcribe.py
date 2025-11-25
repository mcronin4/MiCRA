"""
Transcription agent using Faster-Whisper.

This module provides transcription functionality that uses a shared ASR model
instance managed by the ASRService to avoid expensive model reloading.
"""

import os
import time
from typing import Optional, List, Dict
from .asr_service import get_asr_model
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
ASR_VAD = os.getenv("ASR_VAD", "true").lower() == "true"


def transcribe_audio_or_video_file(audio_path: str) -> Optional[List[Dict[str, any]]]:
    """
    Transcribes an audio file using Faster-Whisper with a shared model instance.

    Args:
        audio_path (str): Path to the audio file.

    Returns:
        Optional[List[Dict]]: A list of transcription segments with 'start', 'end', and 'text' keys,
            or None if transcription fails.
    """
    # Normalize path
    audio_path = os.path.normpath(audio_path)

    try:
        # Check if file exists
        if not os.path.exists(audio_path):
            print(f"Audio file not found at: {audio_path}")
            return None

        # Get the shared model instance (loaded once at startup)
        model = get_asr_model()

        # Transcribe audio
        print("Transcribing audio...")
        start_time = time.time()

        # Return timestamped segments (start, end, text) and metadata
        segments, info = model.transcribe(audio_path, vad_filter=ASR_VAD)

        end_time = time.time()
        elapsed = end_time - start_time

        print(f"Detected language: {info.language}")
        results = []
        for seg in segments:
            results.append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip()  # .strip(): clean text, no extra space
            })
            print(f"[{seg.start:.2f} - {seg.end:.2f}] {seg.text}")

        print(f"Transcription completed in {elapsed:.2f} seconds.")
        return results

    except Exception as e:
        print(f"Error during transcription: {e}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        print(f"Full error details: {traceback.format_exc()}")
        return None
