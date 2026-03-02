"""
Image Extraction Module
- Scene detection via PySceneDetect
- Keyframe extraction pipeline
"""

from .keyframe_pipeline import run_keyframe_pipeline, DEFAULT_CONFIG
from .scene_detection import detect_scenes

__all__ = [
    "run_keyframe_pipeline",
    "DEFAULT_CONFIG",
    "detect_scenes",
]
