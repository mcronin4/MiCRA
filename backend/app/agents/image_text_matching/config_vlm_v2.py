"""
Configuration for VLM-based image-text matching.

Defines settings for Fireworks Qwen 2.5 VL model integration.
"""

import os
from dotenv import load_dotenv
from typing import Optional

load_dotenv()


class VLMConfig:
    """Configuration for VLM-based image text matchers"""
    
    # Fireworks API settings
    FIREWORK_API_KEY: Optional[str] = os.getenv("FIREWORK_API_KEY")
    FIREWORKS_MODEL: str = (
        os.getenv("FIREWORKS_VLM_MODEL")
        or os.getenv("FIREWORKS_MODEL")
    )
    
    # Image processing settings
    MAX_IMAGE_DIMENSION: Optional[int] = None  # No downsampling by default
    
    # Model inference settings
    DEFAULT_TEMPERATURE: float = 0.0  # Deterministic responses
    
    # Token limits for different tasks
    MAX_TOKENS_OCR: int = 300        # Text extraction
    MAX_TOKENS_CAPTION: int = 100    # Image captioning
    MAX_TOKENS_SIMILARITY: int = 10  # Similarity rating (just a number)
    
    # Scoring weights (must sum to 1.0)
    # Note: Timestamp weight is 0 since we're ignoring timestamps for now
    DEFAULT_SEMANTIC_WEIGHT: float = 0.6
    DEFAULT_DETAIL_WEIGHT: float = 0.4
    
    @classmethod
    def get_api_key(cls) -> str:
        """
        Get Fireworks API key from config or environment.
        
        Returns:
            API key string
        
        Raises:
            ValueError: If API key is not set
        """
        api_key = cls.FIREWORK_API_KEY
        if not api_key:
            raise ValueError(
                "FIREWORK_API_KEY not found. "
                "Please set it in your environment or .env file."
            )
        return api_key

    @classmethod
    def validate_weights(cls, semantic_weight: float, detail_weight: float) -> None:
        """
        Validate that scoring weights are reasonable.
        
        Args:
            semantic_weight: Weight for semantic similarity
            detail_weight: Weight for detail verification
        
        Raises:
            ValueError: If weights are invalid
        """
        total = semantic_weight + detail_weight
        
        if not (0.99 <= total <= 1.01):  # Allow small floating point errors
            raise ValueError(
                f"Weights must sum to 1.0, got {total:.3f} "
                f"(semantic={semantic_weight}, detail={detail_weight})"
            )
        
        if semantic_weight < 0 or detail_weight < 0:
            raise ValueError("Weights must be non-negative")


# Preset configurations for different use cases
class VLMPresets:
    """Preset weight configurations for different scenarios"""
    
    @staticmethod
    def semantic_priority():
        """Heavy focus on overall semantic match"""
        return {
            'semantic_weight': 0.8,
            'detail_weight': 0.2
        }
    
    @staticmethod
    def detail_priority():
        """Heavy focus on specific details (OCR, captions)"""
        return {
            'semantic_weight': 0.3,
            'detail_weight': 0.7
        }
    
    @staticmethod
    def balanced():
        """Balanced configuration (default)"""
        return {
            'semantic_weight': 0.6,
            'detail_weight': 0.4
        }


