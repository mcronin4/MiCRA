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

# Note: ImageTextMatcher from embeddings.py requires numpy and is not imported by default
# Use ImageTextMatcherVLM instead for Vercel deployment

__all__ = [
    'TextSummary',
    'ImageCandidate',
    'ImageMatch',
    'ImageTextMatcherVLM',
]

__version__ = '0.1.0'

