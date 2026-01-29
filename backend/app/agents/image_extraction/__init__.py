"""
Image Extraction Module
- Scene detection via PySceneDetect
- Frame analysis via DeepFace + Places365
- Keyframe extraction pipeline
"""

from .keyframe_pipeline import run_keyframe_pipeline, DEFAULT_CONFIG
from .scene_detection import detect_scenes
from .analyze_frame import (
    load_places_model,
    classify_scene,
    analyze_emotion,
    analyze_frame_from_path
)

__all__ = [
    "run_keyframe_pipeline",
    "DEFAULT_CONFIG",
    "detect_scenes",
    "load_places_model",
    "classify_scene",
    "analyze_emotion",
    "analyze_frame_from_path",
]

