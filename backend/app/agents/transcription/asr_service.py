"""
ASR (Automatic Speech Recognition) Model Service

Manages the lifecycle of the WhisperModel to avoid reloading it on every request.
The model is loaded once at application startup and reused across all transcription requests.
"""

import os
from typing import Optional
from dotenv import load_dotenv
from faster_whisper import WhisperModel

# Load environment variables
load_dotenv()

# Configuration from environment variables
ASR_MODEL = os.getenv("ASR_MODEL", "tiny")
ASR_DEVICE = os.getenv("ASR_DEVICE", "cpu")  # cuda | metal | cpu | auto
# float16 | int8_float16 | int8
ASR_COMPUTE = os.getenv("ASR_COMPUTE", "int8_float16")


class ASRService:
    """
    Service for managing the WhisperModel instance.
    Provides singleton-like access to a shared model instance.
    """

    _instance: Optional['ASRService'] = None
    _model: Optional[WhisperModel] = None

    def __init__(self):
        """Initialize the ASR service. Model is loaded lazily on first use."""
        if ASRService._instance is not None:
            raise RuntimeError(
                "ASRService is a singleton. Use get_instance() instead.")
        ASRService._instance = self

    @classmethod
    def get_instance(cls) -> 'ASRService':
        """Get the singleton instance of ASRService."""
        if cls._instance is None:
            cls._instance = cls.__new__(cls)
        return cls._instance

    def get_model(self) -> WhisperModel:
        """
        Get the WhisperModel instance, loading it if necessary.

        Returns:
            WhisperModel: The loaded WhisperModel instance.
        """
        if self._model is None:
            print(
                f"Loading Whisper model: {ASR_MODEL} on {ASR_DEVICE} with {ASR_COMPUTE}...")
            self._model = WhisperModel(
                ASR_MODEL,
                device=ASR_DEVICE,
                compute_type=ASR_COMPUTE
            )
            print("✅ Whisper model loaded successfully")
        return self._model

    def close(self):
        """
        Close and cleanup the model instance.
        Should be called during application shutdown.
        """
        if self._model is not None:
            # WhisperModel doesn't have an explicit close method,
            # but we can clear the reference to allow garbage collection
            self._model = None
            print("✅ Whisper model closed")

    def is_loaded(self) -> bool:
        """Check if the model is currently loaded."""
        return self._model is not None


def get_asr_model() -> WhisperModel:
    """
    Convenience function to get the ASR model instance.
    Use this function to access the shared model in your code.

    Returns:
        WhisperModel: The shared WhisperModel instance.
    """
    service = ASRService.get_instance()
    return service.get_model()


