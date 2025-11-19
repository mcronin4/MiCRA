"""
Image-Text Matching Module

This module provides functionality for matching video frames to text summaries
using multimodal vision-language models.
"""

from .embeddings import (
    ImageTextMatcher,
    TextSummary,
    ImageCandidate,
    ImageMatch
)

from .config import (
    MatchingConfig,
    PresetConfigurations,
    get_config_for_content_type
)

__all__ = [
    'ImageTextMatcher',
    'TextSummary',
    'ImageCandidate',
    'ImageMatch',
    'MatchingConfig',
    'PresetConfigurations',
    'get_config_for_content_type',
]

__version__ = '0.1.0'

