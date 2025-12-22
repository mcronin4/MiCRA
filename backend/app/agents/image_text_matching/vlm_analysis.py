"""
Multi-Stage VLM Image-Text Matching

Uses Fireworks Qwen 2.5 VL with separate API calls for:
1. Text extraction (OCR replacement)
2. Image captioning (BLIP-2 replacement)
3. Semantic similarity rating (SigLIP replacement)

Combines results using same scoring logic as original implementation.
"""

import re
from typing import List, Dict, Optional
from dataclasses import dataclass
from uu import Error

from .embeddings import TextSummary, ImageCandidate, ImageMatch
from .config_vlm import VLMConfig
from .utils_vlm import (
    image_to_base64,
    create_async_fireworks_client,
    parse_numeric_response,
    format_image_content
)
from fireworks import AsyncFireworks


class ImageTextMatcherVLM:
    """
    Multi-stage VLM matcher that makes separate API calls for each scoring component.
    
    Architecture:
    - 3 separate API calls per image-text pair
    - Each call optimized for specific task
    - Results combined with weighted scoring
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        max_image_dimension: Optional[int] = None,
        weights: Optional[Dict[str, float]] = None,
        client: Optional[AsyncFireworks] = None
    ):
        """
        Initialize multi-stage VLM matcher.
        
        Args:
            api_key: Fireworks API key (uses VLMConfig.get_api_key() if None)
            max_image_dimension: Optional max dimension for image downsampling
            weights: Dict with 'semantic_weight' and 'detail_weight' (must sum to 1.0)
            client: Optional AsyncFireworks client (creates new one if None)
        """
        # Get API key
        self.api_key = api_key or VLMConfig.get_api_key()
        
        # Initialize Fireworks client (use provided or create new)
        self.client = client or create_async_fireworks_client(self.api_key)
        
        # Image processing settings
        self.max_image_dimension = max_image_dimension or VLMConfig.MAX_IMAGE_DIMENSION
        
        # Set scoring weights
        if weights:
            self.semantic_weight = weights.get('semantic_weight', VLMConfig.DEFAULT_SEMANTIC_WEIGHT)
            self.detail_weight = weights.get('detail_weight', VLMConfig.DEFAULT_DETAIL_WEIGHT)
        else:
            self.semantic_weight = VLMConfig.DEFAULT_SEMANTIC_WEIGHT
            self.detail_weight = VLMConfig.DEFAULT_DETAIL_WEIGHT
        
        # Validate weights
        VLMConfig.validate_weights(self.semantic_weight, self.detail_weight)
        
        # Initialize caches
        self._ocr_cache: Dict[str, str] = {}
        self._caption_cache: Dict[str, str] = {}
        
        print(f"✓ ImageTextMatcherVLM initialized")
        print(f"  Model: {VLMConfig.FIREWORKS_MODEL}")
        print(f"  Weights: semantic={self.semantic_weight:.2f}, detail={self.detail_weight:.2f}")
        if self.max_image_dimension:
            print(f"  Max image dimension: {self.max_image_dimension}px")
    
    async def _extract_text(self, image_base64: str, image_id: str) -> str:
        """
        Extract text from image using VLM (OCR replacement).
        
        Args:
            image_base64: Base64-encoded image data URL
            image_id: Unique image identifier for caching
        
        Returns:
            Extracted text string
        """
        # Check cache
        if image_id in self._ocr_cache:
            return self._ocr_cache[image_id]
        
        # Build prompt
        prompt = (
            "Extract all visible text from this image. "
            "Return only the text you see, with no additional commentary. "
            "If no text is visible, respond with 'NONE'."
        )
        
        # Make API call
        response = await self.client.chat.completions.create(
            model=VLMConfig.FIREWORKS_MODEL,
            messages=[{
                "role": "user",
                "content": format_image_content(image_base64, prompt)
            }],
            max_tokens=VLMConfig.MAX_TOKENS_OCR,
            temperature=VLMConfig.DEFAULT_TEMPERATURE
        )
        
        extracted_text = response.choices[0].message.content.strip()
        
        # Handle "NONE" response
        if extracted_text.upper() == "NONE":
            extracted_text = ""
        
        # Cache result
        self._ocr_cache[image_id] = extracted_text
        
        return extracted_text
    
    async def _generate_caption(self, image_base64: str, image_id: str) -> str:
        """
        Generate image caption using VLM (BLIP-2 replacement).
        
        Args:
            image_base64: Base64-encoded image data URL
            image_id: Unique image identifier for caching
        
        Returns:
            Image caption string
        """
        # Check cache
        if image_id in self._caption_cache:
            return self._caption_cache[image_id]
        
        # Build prompt
        prompt = (
            "Describe this image in 1-2 sentences. "
            "Focus on: main subjects, activities, visible objects, text/graphics, and setting. "
            "Be concise and factual."
        )
        
        # Make API call
        response = await self.client.chat.completions.create(
            model=VLMConfig.FIREWORKS_MODEL,
            messages=[{
                "role": "user",
                "content": format_image_content(image_base64, prompt)
            }],
            max_tokens=VLMConfig.MAX_TOKENS_CAPTION,
            temperature=VLMConfig.DEFAULT_TEMPERATURE
        )
        
        caption = response.choices[0].message.content.strip()
        
        # Cache result
        self._caption_cache[image_id] = caption
        
        return caption
    
    async def _compute_similarity_score(self, image_base64: str, text: str) -> float:
        """
        Compute semantic similarity score using VLM (SigLIP replacement).
        
        Args:
            image_base64: Base64-encoded image data URL
            text: Text content to match against
        
        Returns:
            Similarity score in 0-1 range
        """
        # Build prompt
        prompt = (
            f"Rate how well this image matches the following text on a scale from 0 to 100, where:\n"
            f"- 0 = completely unrelated\n"
            f"- 50 = somewhat related (shares general topic)\n"
            f"- 100 = perfect match (image directly illustrates the text)\n\n"
            f"Text to match:\n\"\"\"{text}\"\"\"\n\n"
            f"Respond with ONLY a number from 0-100, no explanation."
        )
        
        try:
            # Make API call
            response = await self.client.chat.completions.create(
                model=VLMConfig.FIREWORKS_MODEL,
                messages=[{
                    "role": "user",
                    "content": format_image_content(image_base64, prompt)
                }],
                max_tokens=VLMConfig.MAX_TOKENS_SIMILARITY,
                temperature=VLMConfig.DEFAULT_TEMPERATURE
            )
        except Error as e:
            print(f"Fireworks API error: {e}")
            return 0.5  # Default to neutral score on error
        
        response_text = response.choices[0].message.content.strip()
        
        # Parse numeric response
        try:
            score = parse_numeric_response(response_text)
            # Normalize to 0-1 range
            score = score / 100.0
            # Clamp to valid range
            score = max(0.0, min(1.0, score))
        except ValueError as e:
            print(f"Warning: Could not parse similarity score: {e}")
            score = 0.5  # Default to neutral score
        
        return score
    
    async def compute_detail_verification_score(
        self,
        image_base64: str,
        image_id: str,
        text: str
    ) -> float:
        """
        Verify image details match text content (uses OCR + caption).
        
        Same logic as original implementation, but uses VLM for OCR and captioning.
        
        Args:
            image_base64: Base64-encoded image data URL
            image_id: Unique image identifier
            text: Text content to verify
        
        Returns:
            Detail verification score in 0-1 range
        """
        # Get caption and OCR text
        caption = await self._generate_caption(image_base64, image_id)
        ocr_text = await self._extract_text(image_base64, image_id)
        
        # Combine visual information
        visual_info = f"{caption} {ocr_text}".lower()
        text_lower = text.lower()
        
        # PRIMARY: Content-based word overlap
        # Extract meaningful words (4+ characters to avoid noise)
        text_words = set(re.findall(r'\b\w{4,}\b', text_lower))
        visual_words = set(re.findall(r'\b\w{4,}\b', visual_info))
        
        # Calculate base overlap score
        overlap = len(text_words & visual_words)
        base_score = overlap / len(text_words) if len(text_words) > 0 else 0.0
        
        # BONUS: Check for quoted text in OCR (should match exactly)
        quoted_pattern = r'["\']([^"\']{3,})["\']'
        quoted_texts = re.findall(quoted_pattern, text)
        quoted_bonus = 0.0
        
        if quoted_texts:
            quoted_matches = sum(1 for quoted in quoted_texts if quoted.lower() in ocr_text.lower())
            # Strong bonus for quoted text matches
            quoted_bonus = 0.3 * (quoted_matches / len(quoted_texts))
        
        # Combine scores
        final_score = min(base_score + quoted_bonus, 1.0)
        
        return final_score
    
    async def match_single_pair(
        self,
        candidate: ImageCandidate,
        summary: TextSummary
    ) -> ImageMatch:
        """
        Match a single image to a single text summary.
        
        Args:
            candidate: Image candidate to match
            summary: Text summary to match against
        
        Returns:
            ImageMatch object with all scores
        """
        # Convert image to base64
        image_base64 = image_to_base64(candidate.filepath, self.max_image_dimension)
        
        # Compute semantic score
        semantic_score = await self._compute_similarity_score(image_base64, summary.text_content)
        
        # Compute detail score
        detail_score = await self.compute_detail_verification_score(
            image_base64,
            candidate.image_id,
            summary.text_content
        )
        
        # Timestamp score is 0 (ignored for now)
        timestamp_score = 0.0
        
        # Compute weighted combined score
        combined_score = (
            self.semantic_weight * semantic_score +
            self.detail_weight * detail_score
        )
        
        return ImageMatch(
            image_id=candidate.image_id,
            summary_id=summary.summary_id,
            timestamp_score=timestamp_score,
            semantic_score=semantic_score,
            detail_score=detail_score,
            combined_score=combined_score
        )
    
    def match_images_to_summary(
        self,
        summary: TextSummary,
        candidates: List[ImageCandidate],
        top_k: int = 3
    ) -> List[ImageMatch]:
        """
        Find best matching images for a text summary.
        
        Args:
            summary: Text summary to match
            candidates: List of image candidates
            top_k: Number of top matches to return
        
        Returns:
            List of top-k ImageMatch objects, sorted by combined_score (descending)
        """
        matches = []
        
        print(f"\nMatching {len(candidates)} images to summary '{summary.summary_id}'...")
        
        for candidate in candidates:
            # Only consider images from same video
            if candidate.video_id != summary.video_id:
                continue
            
            try:
                match = self.match_single_pair(candidate, summary)
                matches.append(match)
                print(f"  {candidate.image_id}: score={match.combined_score:.3f}")
            except Exception as e:
                print(f"  Error matching {candidate.image_id}: {e}")
                continue
        
        # Sort by combined score (descending)
        matches.sort(key=lambda x: x.combined_score, reverse=True)
        
        return matches[:top_k]
    
    def match_summaries_to_images(
        self,
        summaries: List[TextSummary],
        candidates: List[ImageCandidate],
        top_k: int = 3
    ) -> Dict[str, List[ImageMatch]]:
        """
        Match all text summaries to their best matching images.
        
        Args:
            summaries: List of text summaries
            candidates: List of image candidates
            top_k: Number of top matches per summary
        
        Returns:
            Dictionary mapping summary_id to list of top-k ImageMatch objects
        """
        results = {}
        
        print(f"\nMatching {len(summaries)} summaries to {len(candidates)} images...")
        
        for summary in summaries:
            matches = self.match_images_to_summary(summary, candidates, top_k)
            results[summary.summary_id] = matches
            
            if matches:
                top = matches[0]
                print(f"✓ {summary.summary_id}: top match = {top.image_id} (score: {top.combined_score:.3f})")
        
        # Print cache statistics
        print(f"\n✓ Processing complete")
        print(f"  Cached: {len(self._caption_cache)} captions, {len(self._ocr_cache)} OCR texts")
        
        return results
    
    def clear_cache(self):
        """Clear the caption and OCR caches."""
        self._caption_cache.clear()
        self._ocr_cache.clear()
        print(f"Cache cleared")
    
    def get_cache_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        return {
            "cached_captions": len(self._caption_cache),
            "cached_ocr_texts": len(self._ocr_cache)
        }


