"""
Shared types for image-text matching.
These are simple dataclasses with no heavy dependencies.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class TextSummary:
    """Represents a text summary segment with optional timestamps."""
    summary_id: str
    text_content: str
    video_id: Optional[str] = None
    start_time: Optional[float] = None  # in seconds
    end_time: Optional[float] = None    # in seconds


@dataclass
class ImageCandidate:
    """Represents a candidate image/frame with metadata."""
    image_id: str
    timestamp: Optional[float] = None  # in seconds
    filepath: Optional[str] = None
    video_id: Optional[str] = None


@dataclass
class ImageMatch:
    """Represents a matched image with its scores."""
    image_id: str
    summary_id: str
    timestamp_score: float
    semantic_score: float
    detail_score: float
    combined_score: float

