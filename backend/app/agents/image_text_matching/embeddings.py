"""
SITMA - Main code for the sub-system

Matches video frames to text summary sections using three scoring metrics:
1. OPTIONAL: Timestamp Proximity Score, if timestramps are available, in the textsummary dataclass
2. Semantic Similarity Score (SigLIP embeddings)
3. OPTIONAL: Image Detail Verification Score (BLIP-2 captioning + Tesseract OCR), this is optional and can be disabled because i know nihal was also doing this.
"""

import os
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import numpy as np
from PIL import Image
import re

# Lazy import heavy ML dependencies to avoid deployment issues if not needed
try:
    import torch
    from sklearn.preprocessing import MinMaxScaler
    import pytesseract
    from transformers import AutoProcessor, AutoModel, Blip2Processor, Blip2ForConditionalGeneration
    ML_DEPS_AVAILABLE = True
except ImportError as e:
    ML_DEPS_AVAILABLE = False
    # Create dummy classes for type hints when ML deps are not available
    torch = None  # type: ignore
    MinMaxScaler = None  # type: ignore
    pytesseract = None  # type: ignore
    AutoProcessor = None  # type: ignore
    AutoModel = None  # type: ignore
    Blip2Processor = None  # type: ignore
    Blip2ForConditionalGeneration = None  # type: ignore

from .config import MatchingConfig

# Configure Tesseract path for Windows
import platform

#added this bevause tesseract wasnt working, works now if you have it installed
def _configure_tesseract():
    """Configure tesseract path, especially for Windows systems."""
    # First check if explicitly set in config
    if MatchingConfig.TESSERACT_CMD:
        if os.path.exists(MatchingConfig.TESSERACT_CMD):
            pytesseract.pytesseract.tesseract_cmd = MatchingConfig.TESSERACT_CMD
            return True
        else:
            print(f"⚠️ Tesseract path set in config but not found: {MatchingConfig.TESSERACT_CMD}")
    
    # Auto-detect on Windows
    if platform.system() == 'Windows':
        possible_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            r"C:\Users\{}\AppData\Local\Programs\Tesseract-OCR\tesseract.exe".format(os.getenv('USERNAME', ''))
        ]
        for path in possible_paths:
            if os.path.exists(path):
                pytesseract.pytesseract.tesseract_cmd = path
                print(f"✓ Found Tesseract at: {path}")
                return True
        
        print("⚠️ Tesseract not found in common Windows locations.")
        print(" Or set TESSERACT_CMD in config.py")
        return False
    
    return True  # On Linux/Mac, assume it's in PATH

_configure_tesseract()

#Data classes for the text summary, image candidate, and image match, to be used throughout
@dataclass
class TextSummary:
    #Represents a text summary segment with optional timestamps.
    summary_id: str
    video_id: str
    text_content: str
    start_time: Optional[float] = None  # in seconds (None if timestamps unavailable)
    end_time: Optional[float] = None    # in seconds (None if timestamps unavailable)


@dataclass
class ImageCandidate:
    #Represents a candidate image/frame with metadata
    image_id: str
    video_id: str
    timestamp: float  # in seconds
    filepath: str


@dataclass
class ImageMatch:
    #Represents a matched image with its scores, uses summary_id and image_id to link the match.
    image_id: str
    summary_id: str
    timestamp_score: float
    semantic_score: float
    detail_score: float
    combined_score: float


class ImageTextMatcher:
    """
    Main class for matching images to text summaries using the three models.
    """
    
    def __init__(
        self,
        device: Optional[str] = None,
        timestamp_weight: float = None,
        semantic_weight: float = None,
        detail_weight: float = None,
        timestamp_window: float = None,
        use_ocr: bool = None,
        use_timestamp_matching: bool = None,
        use_detail_verification: bool = None
    ):
        if not ML_DEPS_AVAILABLE:
            raise ImportError(
                "ML dependencies (torch, transformers, scikit-learn, pytesseract) are not installed. "
                "Install them with: pip install torch transformers scikit-learn pytesseract"
            )
        
        #from my understanding this is where the models are loaded, cuda if gpu is available that's what we want
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Initializing ImageTextMatcher on device: {self.device}")
    
        #If the config settings weren't set, use the default settings in config.py

        # Matching mode settings
        self.use_timestamp_matching = use_timestamp_matching if use_timestamp_matching is not None else MatchingConfig.USE_TIMESTAMP_MATCHING
        self.use_detail_verification = use_detail_verification if use_detail_verification is not None else MatchingConfig.USE_DETAIL_VERIFICATION
        
        # Scoring weights - use config defaults if not specified
        self.timestamp_weight = timestamp_weight if timestamp_weight is not None else MatchingConfig.DEFAULT_TIMESTAMP_WEIGHT
        self.semantic_weight = semantic_weight if semantic_weight is not None else MatchingConfig.DEFAULT_SEMANTIC_WEIGHT
        self.detail_weight = detail_weight if detail_weight is not None else MatchingConfig.DEFAULT_DETAIL_WEIGHT
        self.timestamp_window = timestamp_window if timestamp_window is not None else MatchingConfig.DEFAULT_TIMESTAMP_WINDOW
        self.use_ocr = use_ocr if use_ocr is not None else MatchingConfig.USE_OCR
        
        # Adjust weights based on enabled features
        disabled_features = []
        
        if not self.use_timestamp_matching:
            disabled_features.append("timestamp matching")
            self.timestamp_weight = 0.0
        
        if not self.use_detail_verification:
            disabled_features.append("detail verification")
            self.detail_weight = 0.0
        
        # Print the disabled features
        if disabled_features:
            print(f"Disable features: {', '.join(disabled_features)}")
        
        # Renormalize weights to sum to 1.0
        total_weight = self.timestamp_weight + self.semantic_weight + self.detail_weight
        if total_weight > 0:
            # If the weights don't sum to 1.0, normalize them
            if not np.isclose(total_weight, 1.0):
                print(f"⚠️ Weights sum to {total_weight:.3f}, normalizing...")
                self.timestamp_weight /= total_weight
                self.semantic_weight /= total_weight
                self.detail_weight /= total_weight
        else:
            # All weights are 0 - this is a configuration error
            raise ValueError(
                "All scoring weights are 0. At least one scoring method must be enabled. "
                "Check your timestamp_weight, semantic_weight, and detail_weight settings."
            )
        
        # Initialize caches for expensive operations
        self._caption_cache = {}  # image_id -> caption
        self._ocr_cache = {}      # image_id -> ocr_text
        
        # Config is all set up, load up the models!!!!!!
        self._load_siglip()
        #we only need to load blip2 if detail verification is enabled
        if self.use_detail_verification:
            self._load_blip2()
        else:
            print("Skipping BLIP-2 model since detail verification is disabled")
        
        print("ImageTextMatcher initialized successfully!!")
    
    def _load_siglip(self):
        #Load up sigLIP model
        model_name = MatchingConfig.SIGLIP_MODEL
        print(f"Loading SigLIP ({model_name})...")
        
        try:
            #Load the SigLIP AI processor from HuggingFace, downloads from huggingface servers, model name is in config
            self.siglip_processor = AutoProcessor.from_pretrained(model_name)
            #Load the SigLIP AI model from HuggingFace, moves it onto the device (GPU or CPU)
            self.siglip_model = AutoModel.from_pretrained(model_name).to(self.device)
            #Set the model to evaluation mode
            self.siglip_model.eval()
            print("SigLIP loaded successfully")
        except Exception as e:
            print(f"Error loading SigLIP: {e}")
            raise
    
    def _load_blip2(self):
        #Load up blip2 model
        model_name = MatchingConfig.BLIP2_MODEL
        print(f"Loading BLIP-2 ({model_name})...")
        
        try:
            #Load the BLIP-2 AI processor from HuggingFace, downloads from huggingface servers, model name is in config
            self.blip2_processor = Blip2Processor.from_pretrained(model_name)
            #Load the BLIP-2 AI model from HuggingFace, moves it onto the device (GPU or CPU), better wiht float16 if using GPU, float32 if using CPU
            self.blip2_model = Blip2ForConditionalGeneration.from_pretrained(model_name, torch_dtype=torch.float16 if self.device == 'cuda' else torch.float32).to(self.device)
            #Set the model to evaluation mode
            self.blip2_model.eval()
            print("BLIP-2 loaded successfully")
        except Exception as e:
            print(f"Error loading BLIP-2: {e}")
            raise
    
    def compute_timestamp_proximity_score(self,image_timestamp: float,text_start: float, text_end: float) -> float:
        """
        Calculates timestamp proximity score.
        
        Score is 1.0 if image is within text segment, decreases linearly
        with distance outside the segment up to timestamp_window.
        """
        # If image is within the segment, perfect score lfg
        if text_start <= image_timestamp <= text_end:
            return 1.0
        
        # Calculate distance to nearest boundary
        if image_timestamp < text_start:
            distance = text_start - image_timestamp
        else:  # image_timestamp > text_end
            distance = image_timestamp - text_end
        
        #Out of the window, you get a 0
        if distance >= self.timestamp_window:
            return 0.0
        #linear score decay within window
        return 1.0 - (distance / self.timestamp_window)
    
    def compute_semantic_similarity_score(self,image: Image.Image,text: str) -> float:
        """
        Compute cosine similarity between image and text using SigLIP.
        takes in image and text and returns a score 0 to 1
        """
        #No gradients, were not training model, just embeddings
        with torch.no_grad():
            # Truncate text if necessary before processing
            # SigLIP max sequence length is 64 tokens (max_position_embeddings)
            # Get the tokenizer from processor and truncate text manually
            tokenizer = self.siglip_processor.tokenizer
            max_length = getattr(self.siglip_model.config, 'max_position_embeddings', 64)
            
            # Tokenize and truncate text to max length
            tokens = tokenizer.encode(text, truncation=True, max_length=max_length, return_tensors="pt")

            # Process inputs with truncated text
            inputs = self.siglip_processor(
                text=[text], 
                images=image, 
                return_tensors="pt", 
                padding=True,
                truncation=True,
                max_length=getattr(self.siglip_model.config, 'max_position_embeddings', 64)
            ).to(self.device)
            
            # Get embeddings
            outputs = self.siglip_model(**inputs)
            
            # Extract embeddings
            image_embeds = outputs.image_embeds
            text_embeds = outputs.text_embeds
            
            # Normalize embeddings, gives the vectors a length of 1, so they can be compared
            image_embeds = image_embeds / image_embeds.norm(dim=-1, keepdim=True)
            text_embeds = text_embeds / text_embeds.norm(dim=-1, keepdim=True)
            
            # Compute cosine similarity, dots the matrixes together, and squeezes the result into a 1D tensor
            similarity = torch.matmul(image_embeds, text_embeds.T).squeeze()
            
            # Convert to 0-1 range (from -1 to 1)
            score = (similarity.item() + 1.0) / 2.0
            
        return score
    
    def generate_image_caption(self, image: Image.Image, image_id: str) -> str:
        """
        If detail matching is enabled, we'll generate a caption for the image using BLIP-2.
        Takes in a image and image_id, outputs a caption.
        Uses cache to avoid recomputing captions for the same image.
        """
        # Check cache first
        if image_id in self._caption_cache:
            return self._caption_cache[image_id]
        
        # Generate caption if not cached
        with torch.no_grad():
            inputs = self.blip2_processor(image, return_tensors="pt").to(self.device,torch.float16 if self.device == 'cuda' else torch.float32)
            
            #generate the caption, max length is in config
            generated_ids = self.blip2_model.generate(**inputs, max_length=MatchingConfig.BLIP2_MAX_LENGTH)
            #gives a list of toxen ids(the words in the caption), which we then decode into a string
            caption = self.blip2_processor.batch_decode(
                generated_ids,
                skip_special_tokens=True
            )[0].strip()
            #strip the whitespace from the caption
        
        # Cache the result
        self._caption_cache[image_id] = caption
        return caption
    
    def extract_text_from_image(self, image: Image.Image, image_id: str) -> str:
        """
        Extract text from image using Tesseract OCR.
        Takes in a image and image_id, outputs a string of text.
        Uses cache to avoid recomputing OCR for the same image.
        """
        if not self.use_ocr:
            return ""
        
        # Check cache first
        if image_id in self._ocr_cache:
            return self._ocr_cache[image_id]
        
        # Extract OCR text if not cached
        try:
            # Convert to RGB if needed, tesseract only works with RGB images
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Extract text
            text = pytesseract.image_to_string(image)
            ocr_text = text.strip()
        except Exception as e:
            print(f"OCR extraction failed: {e}")
            ocr_text = ""
        
        # Cache the result
        self._ocr_cache[image_id] = ocr_text
        return ocr_text
    
    def compute_detail_verification_score(self, image: Image.Image, image_id: str, text: str) -> float:
        """
        Verify that content mentioned in text appears in the image.
        
        checks for:
        - Word overlap between text content and image caption/OCR
        - specific visual indicators (chart, graph, etc.) if mentioned
        - quoted text that could should appear in OCR
        
        takes in image, image_id, and text and returns a score between 0 and 1
        """
        # Generate caption and extract OCR text, the two functions above (with caching)
        caption = self.generate_image_caption(image, image_id)
        ocr_text = self.extract_text_from_image(image, image_id)
        
        # Combine visual information
        visual_info = f"{caption} {ocr_text}".lower()
        text_lower = text.lower()

        
        # PRIMARY: Content-based word overlap
        # Extract meaningful words (4+ characters to avoid noise)
        text_words = set(re.findall(r'\b\w{4,}\b', text_lower))
        visual_words = set(re.findall(r'\b\w{4,}\b', visual_info))
        
        # Calculate base overlap score, handled if 0
        overlap = len(text_words & visual_words)
        if len(text_words) > 0:
            base_score = overlap / len(text_words)
        else:
            base_score = 0.0
        
        # BONUS: Check for specific visual indicators
        visual_keywords = MatchingConfig.VISUAL_KEYWORDS
        visual_indicator_matches = 0
        visual_indicators_found = 0
        
        for keyword in visual_keywords:
            if keyword in text_lower:
                visual_indicators_found += 1
                if keyword in visual_info:
                    visual_indicator_matches += 1
        
        # Bonus points if visual indicators match (up to 20% boost)
        visual_indicator_bonus = 0.0
        if visual_indicators_found > 0:
            visual_indicator_bonus = 0.2 * (visual_indicator_matches / visual_indicators_found)
        
        # BONUS 2: Check for quoted text in OCR (should match exactly)
        #Uses regex to find quoted text in the text
        quoted_pattern = r'["\']([^"\']{3,})["\']'
        quoted_texts = re.findall(quoted_pattern, text)
        quoted_bonus = 0.0
        
        if quoted_texts:
            #Sum of matches with the OCR text
            quoted_matches = sum(1 for quoted in quoted_texts if quoted.lower() in ocr_text.lower())
            # Strong bonus for quoted text matches
            quoted_bonus = 0.3 * (quoted_matches / len(quoted_texts))
        
        # Combine scores base + bonuses, if its greater than 1.0 it should be a very detailed match
        final_score = min(base_score + visual_indicator_bonus + quoted_bonus, 1.0)
        
        return final_score
    
    def match_single_pair(self, image_candidate: ImageCandidate,text_summary: TextSummary) -> ImageMatch:
        """
        Match a single image to a single text summary.
        
        Takes in a image candidate and text summary
        Computes all score metrics and returns a ImageMatch object with all scores
        """
        # Load image, opens the image from the filepath, and converts it to RGB
        image = Image.open(image_candidate.filepath)
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Compute timestamp score only if enabled AND timestamps are available
        if self.use_timestamp_matching and text_summary.start_time is not None and text_summary.end_time is not None:
            timestamp_score = self.compute_timestamp_proximity_score(image_candidate.timestamp, text_summary.start_time, text_summary.end_time)
        else:
            timestamp_score = 0.0 #this gets weighted as 0 anyway
        
        # Compute semantic score (always computed)
        semantic_score = self.compute_semantic_similarity_score(image, text_summary.text_content)
        
        # Compute detail score only if enabled
        if self.use_detail_verification:
            detail_score = self.compute_detail_verification_score(image, image_candidate.image_id, text_summary.text_content)
        else:
            detail_score = 0.0 #this gets weighted as 0 anyway        
        
        # Compute weighted combined score
        combined_score = (
            self.timestamp_weight * timestamp_score +
            self.semantic_weight * semantic_score +
            self.detail_weight * detail_score
        )
        
        return ImageMatch(
            image_id=image_candidate.image_id,
            summary_id=text_summary.summary_id,
            timestamp_score=timestamp_score,
            semantic_score=semantic_score,
            detail_score=detail_score,
            combined_score=combined_score
        )
    
    def match_images_to_summary(self,text_summary: TextSummary, image_candidates: List[ImageCandidate], top_k: int = 3) -> List[ImageMatch]:
        """
        Find the best matching images for a single text summary.
        
        Given a text summary and a list of image candidates, it finds the best (top_k) matching images for the text summary.
        Note: BLIP-2 captions and OCR text are cached per image to avoid redundant computation (O(N) instead of O(N*M)).
        """
        #array to store the matches
        matches = []
        
        print(f"\nMatching {len(image_candidates)} images to summary '{text_summary.summary_id}'...")
        
        for candidate in image_candidates:
            # make sure we only considering images from the same video
            if candidate.video_id != text_summary.video_id:
                continue
            
            try:
                #Get the image match and add it to the array
                match = self.match_single_pair(candidate, text_summary)
                matches.append(match)
            except Exception as e:
                print(f"Error matching image {candidate.image_id}: {e}")
                continue
        
        # Sort by combined score (descending)
        matches.sort(key=lambda x: x.combined_score, reverse=True)
        
        # Return top-k
        return matches[:top_k]
    
    def match_summaries_to_images(self,text_summaries: List[TextSummary],image_candidates: List[ImageCandidate], top_k: int = 3) -> Dict[str, List[ImageMatch]]:
        """
        Match all text summaries to their best matching images.
        Given list of TextSummary objects, list of ImageCandidate objects and top_k
        Returns Dictionary mapping summary_id to list of top-k ImageMatch objects
        Note: BLIP-2 captions and OCR text are cached per image to avoid redundant computation (O(N) instead of O(N*M)).
        """
        results = {}
        
        print(f"\nMatching {len(text_summaries)} summaries to {len(image_candidates)} images...")
        
        for i, summary in enumerate(text_summaries):
            print(f"Processing summary: {summary.summary_id}")
            matches = self.match_images_to_summary(summary, image_candidates, top_k)
            results[summary.summary_id] = matches
            
            # Print top match
            if matches:
                top = matches[0]
                print(f"Top match: {top.image_id} (score: {top.combined_score:.3f})")
        
        # Print cache statistics
        cache_stats = self.get_cache_stats()
        print(f"\n✓ Processing complete. Cache stats: {cache_stats['cached_captions']} captions, {cache_stats['cached_ocr_texts']} OCR texts cached")
        
        return results
    
    def clear_cache(self):
        """
        Clear the caption and OCR caches.
        Useful when processing a new batch of images or to free memory.
        """
        self._caption_cache.clear()
        self._ocr_cache.clear()
        print(f"Cache cleared: {len(self._caption_cache)} captions, {len(self._ocr_cache)} OCR texts")
    
    def get_cache_stats(self) -> Dict[str, int]:
        """
        Get statistics about cache usage.
        Returns dict with number of cached captions and OCR texts.
        """
        return {
            "cached_captions": len(self._caption_cache),
            "cached_ocr_texts": len(self._ocr_cache)
        }
    
#BAAAAAAANG!!!!