"""
Image-Text Matching Module

This module provides functionality for matching video frames to text summaries
using multimodal vision-language models.
"""

# Import lightweight types (no numpy dependency)
from .matching_types import (
    TextSummary,
    ImageCandidate,
    ImageMatch
)

# Import VLM-based matcher (no numpy dependency)
from .vlm_analysis import ImageTextMatcherVLM

__all__ = [
    'TextSummary',
    'ImageCandidate',
    'ImageMatch',
    'ImageTextMatcherVLM',
]

