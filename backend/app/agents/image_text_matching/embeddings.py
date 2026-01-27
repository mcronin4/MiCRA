"""
SITMA - Main code for the sub-system

Matches video frames to text summary sections using three scoring metrics:
1. OPTIONAL: Timestamp Proximity Score, if timestramps are available, in the textsummary dataclass
2. Semantic Similarity Score (SigLIP embeddings)
3. OPTIONAL: Image Detail Verification Score (BLIP-2 captioning + Tesseract OCR), this is optional and can be disabled because i know nihal was also doing this.
"""

import os
import base64
import io
import json
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
import numpy as np
from PIL import Image
import torch
from sklearn.preprocessing import MinMaxScaler
import re
from difflib import SequenceMatcher
import easyocr
#The models we are using the transformers library from HuggingFace
from transformers import AutoProcessor, AutoModel, Blip2Processor, Blip2ForConditionalGeneration

try:
    from ...llm import gemini as gemini_llm
except Exception:
    gemini_llm = None

from .config_vlm_v1 import MatchingConfig

# Global EasyOCR reader instance (loaded once, reused)
_easyocr_reader = None

def _get_easyocr_reader():
    """Get or create the EasyOCR reader instance."""
    global _easyocr_reader
    if _easyocr_reader is None:
        print("Loading EasyOCR model...")
        _easyocr_reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available())
        print("✓ EasyOCR loaded successfully")
    return _easyocr_reader

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
    caption: str = ""
    ocr_text: str = ""  # All extracted OCR text
    matched_words: str = ""  # Words that matched with the summary
    caption_match_score: float = 0.0  # How well the caption matches the text
    gemini_description: str = ""
    gemini_quality_score: float = 0.0
    gemini_text_match_score: float = 0.0
    gemini_raw_response: str = ""


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
        self._gemini_cache = {}   # cache_key -> gemini analysis
        
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
    
    def generate_image_caption(self, image: Image.Image, image_id: str, content_type: str = "", content_description: str = "") -> str:
        """
        Generate a caption for the image using BLIP-2.
        
        BLIP-2 OPT models work best with:
        1. Unconditional generation (no text prompt) for general captions
        2. Question format ("Question: What is in this image? Answer:") for VQA
        
        Args:
            image: PIL Image
            image_id: Unique identifier for caching
            content_type: Type of content (e.g., "keynote", "product demo")
            content_description: User's brief description of the content
        
        Returns:
            Image caption string
        """
        # Check cache first
        cache_key = f"{image_id}_{content_type}_{content_description[:50] if content_description else ''}"
        if cache_key in self._caption_cache:
            return self._caption_cache[cache_key]
        
        caption = ""
        
        with torch.no_grad():
            dtype = torch.float16 if self.device == 'cuda' else torch.float32
            
            try:
                # Method 1: Unconditional captioning (most reliable for BLIP-2 OPT)
                # Just pass the image without any text prompt
                inputs = self.blip2_processor(image, return_tensors="pt").to(self.device, dtype)
                generated_ids = self.blip2_model.generate(
                    **inputs,
                    max_length=MatchingConfig.BLIP2_MAX_LENGTH,
                    num_beams=5,
                    do_sample=False
                )
                caption = self.blip2_processor.batch_decode(
                    generated_ids,
                    skip_special_tokens=True
                )[0].strip()
                
                # Check if caption is garbage (common garbage patterns)
                garbage_patterns = [
                    r'^click',
                    r'larger (version|view|image)',
                    r'^(the|a|an)\s*$',
                    r'^\d+$',
                    r'^http',
                    r'^www\.',
                ]
                is_garbage = any(re.search(p, caption, re.IGNORECASE) for p in garbage_patterns)
                
                # If caption is too short or garbage, try VQA format
                if not caption or len(caption) < 15 or is_garbage:
                    # Method 2: VQA format with proper question structure
                    vqa_prompt = "Question: What is shown in this image? Answer:"
                    inputs = self.blip2_processor(image, text=vqa_prompt, return_tensors="pt").to(self.device, dtype)
                    generated_ids = self.blip2_model.generate(
                        **inputs,
                        max_length=MatchingConfig.BLIP2_MAX_LENGTH,
                        num_beams=5,
                        do_sample=False
                    )
                    vqa_caption = self.blip2_processor.batch_decode(
                        generated_ids,
                        skip_special_tokens=True
                    )[0].strip()
                    
                    # Clean VQA response - remove question/answer markers
                    vqa_caption = re.sub(r'^(Question:|Answer:)\s*', '', vqa_caption, flags=re.IGNORECASE)
                    vqa_caption = re.sub(r'What is shown in this image\?\s*(Answer:)?\s*', '', vqa_caption, flags=re.IGNORECASE)
                    vqa_caption = vqa_caption.strip()
                    
                    # Use VQA caption if it's better
                    if vqa_caption and len(vqa_caption) > len(caption):
                        caption = vqa_caption
                
                # Final cleanup
                caption = caption.strip()
                
                # If still garbage or empty, indicate failure
                if not caption or len(caption) < 5:
                    caption = "[Caption generation failed]"
                    
            except Exception as e:
                print(f"  ⚠️ Caption generation error: {e}")
                caption = "[Caption generation error]"
        
        # Cache the result
        self._caption_cache[cache_key] = caption
        
        print(f"\n  📸 BLIP-2 Caption for {image_id}:")
        if content_description:
            print(f"     Context: {content_description[:80]}")
        print(f"     Caption: {caption[:200]}{'...' if len(caption) > 200 else ''}")
        
        return caption
    
    def extract_text_from_image(self, image: Image.Image, image_id: str) -> str:
        """
        Extract text from image using EasyOCR (deep learning based).
        Much more accurate than Tesseract for stylized text, screenshots, presentations.
        Uses cache to avoid recomputing OCR for the same image.
        """
        if not self.use_ocr:
            return ""
        
        # Check cache first
        if image_id in self._ocr_cache:
            return self._ocr_cache[image_id]
        
        all_words = set()
        
        try:
            # Convert PIL to numpy array for EasyOCR
            if image.mode != 'RGB':
                image = image.convert('RGB')
            img_array = np.array(image)
            
            # Get EasyOCR reader
            reader = _get_easyocr_reader()
            
            # Run EasyOCR - returns list of (bbox, text, confidence)
            results = reader.readtext(img_array, detail=1, paragraph=False)
            
            # Extract all text with confidence > 0.3
            for (bbox, text, confidence) in results:
                if confidence > 0.3 and text.strip():
                    # Split multi-word results and add each word
                    for word in text.strip().split():
                        cleaned = re.sub(r'[^\w]', '', word)  # Remove punctuation
                        if len(cleaned) >= 2:
                            all_words.add(cleaned.lower())
            
            # Combine all words
            ocr_text = ' '.join(sorted(all_words))
            
            # Print detailed output
            print(f"\n  📝 EasyOCR Results for {image_id}:")
            print(f"     Text regions found: {len(results)}")
            print(f"     Unique words extracted: {len(all_words)}")
            if all_words:
                print(f"     Words: {ocr_text}")
            else:
                print(f"     ⚠️ No text found in image")
            
        except Exception as e:
            print(f"  ❌ EasyOCR extraction failed for {image_id}: {e}")
            import traceback
            traceback.print_exc()
            ocr_text = ""
        
        # Cache the result
        self._ocr_cache[image_id] = ocr_text
        return ocr_text
    
    def _fuzzy_match_words(self, word1: str, word2: str, threshold: float = 0.75) -> bool:
        """
        Check if two words are similar enough using fuzzy matching.
        Handles OCR errors like 'l' vs '1', 'O' vs '0', partial matches, etc.
        """
        # Exact match
        if word1 == word2:
            return True
        
        # One word contains the other (partial match)
        if len(word1) >= 4 and len(word2) >= 4:
            if word1 in word2 or word2 in word1:
                return True
        
        # Check if words start the same (handles plurals, tenses, etc.)
        min_len = min(len(word1), len(word2))
        if min_len >= 4:
            # If first 80% of shorter word matches
            prefix_len = int(min_len * 0.8)
            if word1[:prefix_len] == word2[:prefix_len]:
                return True
        
        # Fuzzy match using sequence matcher (handles OCR errors)
        ratio = SequenceMatcher(None, word1, word2).ratio()
        if ratio >= threshold:
            return True
        
        # Common OCR substitutions check
        ocr_subs = {
            '0': 'o', 'o': '0',
            '1': 'l', 'l': '1', '1': 'i', 'i': '1',
            '5': 's', 's': '5',
            '8': 'b', 'b': '8',
            'rn': 'm', 'm': 'rn',
            'vv': 'w', 'w': 'vv',
        }
        
        # Try common substitutions
        word1_normalized = word1
        word2_normalized = word2
        for old, new in ocr_subs.items():
            word1_normalized = word1_normalized.replace(old, new)
            word2_normalized = word2_normalized.replace(old, new)
        
        if word1_normalized == word2_normalized:
            return True
        
        return False

    def _parse_gemini_response(self, raw_text: str) -> Dict[str, Any]:
        """
        Parse Gemini JSON output and clamp scores to 0-1.
        """
        cleaned = raw_text.strip()
        if not cleaned:
            return {}
        
        # Try to locate the first JSON object in the response
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start:end + 1]
        
        try:
            parsed = json.loads(cleaned)
        except Exception:
            return {}
        
        def clamp_score(value: float) -> float:
            try:
                return max(0.0, min(1.0, float(value)))
            except Exception:
                return 0.0
        
        return {
            "description": parsed.get("description", ""),
            "quality_score": clamp_score(parsed.get("quality_score", 0.0)),
            "text_match_score": clamp_score(parsed.get("text_match_score", 0.0)),
            "raw": raw_text
        }

    def analyze_image_with_gemini(self, image: Image.Image, image_id: str, text: str) -> Dict[str, Any]:
        """
        Send the image and related text to Gemini for a detailed description
        plus quality and text-match scores.
        """
        # Bail early if Gemini is not configured
        if gemini_llm is None or getattr(gemini_llm, "client", None) is None:
            print("Skipping Gemini analysis (Gemini client not available)")
            return {"description": "", "quality_score": 0.0, "text_match_score": 0.0, "raw": ""}
        
        cache_key = f"{image_id}_{hash(text)}"
        if cache_key in self._gemini_cache:
            return self._gemini_cache[cache_key]
        
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()
        encoded_image = base64.b64encode(image_bytes).decode("utf-8")
        
        prompt = (
            "You are a meticulous visual fact extractor. Given an image and related text, return ONLY a JSON object "
            'with fields: description (detailed, 80-150 words), quality_score (0-1 confidence in description detail), '
            'text_match_score (0-1 for how well the image content aligns with the provided text). '
            "Do not include any explanations outside the JSON.\n\n"
            f"Related text to align with:\n{text[:1200]}"
        )
        
        contents = [
            {"text": prompt},
            {"inline_data": {"mime_type": "image/png", "data": encoded_image}},
        ]
        
        try:
            response = gemini_llm.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
            )
            raw_text = response.text or ""
        except Exception as e:
            print(f"Gemini analysis failed for {image_id}: {e}")
            return {"description": "", "quality_score": 0.0, "text_match_score": 0.0, "raw": ""}
        
        parsed = self._parse_gemini_response(raw_text)
        result = {
            "description": parsed.get("description", ""),
            "quality_score": parsed.get("quality_score", 0.0),
            "text_match_score": parsed.get("text_match_score", 0.0),
            "raw": parsed.get("raw", raw_text),
        }
        
        self._gemini_cache[cache_key] = result
        
        print(f"\n  Gemini analysis for {image_id}: quality={result['quality_score']:.2f}, match={result['text_match_score']:.2f}")
        
        return result

    def compute_detail_verification_score(self, image: Image.Image, image_id: str, text: str, content_type: str = "", content_description: str = "") -> Tuple[float, str, float]:
        """
        Verify that content mentioned in text appears in the image.
        Uses FUZZY MATCHING to handle OCR errors and word variations.
        
        checks for:
        - Fuzzy word overlap between text content and image caption/OCR
        - specific visual indicators (chart, graph, etc.) if mentioned
        - quoted text that could should appear in OCR (fuzzy)
        
        takes in image, image_id, text, content_type, and content_description
        returns a tuple of (score, matched_words_string, caption_match_score)
        """
        # Generate caption and extract OCR text, the two functions above (with caching)
        caption = self.generate_image_caption(image, image_id, content_type, content_description)
        ocr_text = self.extract_text_from_image(image, image_id)
        
        # Combine visual information
        visual_info = f"{caption} {ocr_text}".lower()
        text_lower = text.lower()

        
        # PRIMARY: Content-based word overlap with FUZZY MATCHING
        # Extract meaningful words (3+ characters to capture more)
        text_words = set(re.findall(r'\b\w{3,}\b', text_lower))
        visual_words = set(re.findall(r'\b\w{3,}\b', visual_info))
        
        # Find matches using fuzzy matching
        matched_words = set()
        matched_pairs = []  # Track what matched with what
        
        for text_word in text_words:
            for visual_word in visual_words:
                if self._fuzzy_match_words(text_word, visual_word):
                    matched_words.add(text_word)
                    if text_word != visual_word:
                        matched_pairs.append(f"{text_word}≈{visual_word}")
                    else:
                        matched_pairs.append(text_word)
                    break  # Found a match for this text word
        
        # Calculate base overlap score
        if len(text_words) > 0:
            base_score = len(matched_words) / len(text_words)
        else:
            base_score = 0.0
        
        # BONUS: Check for specific visual indicators (also fuzzy)
        visual_keywords = MatchingConfig.VISUAL_KEYWORDS
        visual_indicator_matches = 0
        visual_indicators_found = 0
        matched_visual_keywords = []
        
        for keyword in visual_keywords:
            if keyword in text_lower:
                visual_indicators_found += 1
                # Check fuzzy match for visual keywords
                for visual_word in visual_words:
                    if self._fuzzy_match_words(keyword, visual_word, threshold=0.7):
                        visual_indicator_matches += 1
                        matched_visual_keywords.append(keyword)
                        break
        
        # Bonus points if visual indicators match (up to 20% boost)
        visual_indicator_bonus = 0.0
        if visual_indicators_found > 0:
            visual_indicator_bonus = 0.2 * (visual_indicator_matches / visual_indicators_found)
        
        # BONUS 2: Check for quoted text in OCR (fuzzy match)
        quoted_pattern = r'["\']([^"\']{3,})["\']'
        quoted_texts = re.findall(quoted_pattern, text)
        quoted_bonus = 0.0
        matched_quoted = []
        
        if quoted_texts:
            for quoted in quoted_texts:
                quoted_lower = quoted.lower()
                # Check if quoted text appears (fuzzy)
                if quoted_lower in ocr_text.lower():
                    matched_quoted.append(quoted)
                else:
                    # Try fuzzy match on individual words of the quote
                    quote_words = quoted_lower.split()
                    matches_found = sum(1 for qw in quote_words 
                                       for vw in visual_words 
                                       if self._fuzzy_match_words(qw, vw))
                    if matches_found >= len(quote_words) * 0.6:  # 60% of quote words match
                        matched_quoted.append(f"{quoted}(fuzzy)")
            
            # Strong bonus for quoted text matches
            quoted_bonus = 0.3 * (len(matched_quoted) / len(quoted_texts))
        
        # Combine scores base + bonuses
        final_score = min(base_score + visual_indicator_bonus + quoted_bonus, 1.0)
        
        # Caption quality score: measures how detailed/informative the caption is
        # (not based on word matching, since captions describe the scene/people
        # while text describes the content - both are valid)
        caption_quality_score = 0.0
        if caption:
            # Score based on caption length and detail (longer, more detailed = better)
            caption_length = len(caption.split())
            # Normalize: 10+ words = good quality, 5-10 = medium, <5 = low
            if caption_length >= 10:
                caption_quality_score = 1.0
            elif caption_length >= 5:
                caption_quality_score = 0.6
            elif caption_length >= 3:
                caption_quality_score = 0.3
            else:
                caption_quality_score = 0.1
        
        # Combine all matched content into a string (show fuzzy matches)
        all_matched = matched_pairs + matched_visual_keywords + matched_quoted
        matched_words_str = ', '.join(sorted(set(all_matched)))
        
        # Print matching details
        print(f"\n  🔍 Detail Match for {image_id}:")
        print(f"     Words from text: {len(text_words)}")
        print(f"     Words from image (caption+OCR): {len(visual_words)}")
        print(f"     Caption quality: {caption_quality_score:.1%} ({len(caption.split()) if caption else 0} words)")
        print(f"     Fuzzy matched words ({len(matched_words)}): {matched_words_str[:200]}{'...' if len(matched_words_str) > 200 else ''}")
        print(f"     Detail score: {final_score:.3f}")
        
        return final_score, matched_words_str, caption_quality_score
    
    def match_single_pair(self, image_candidate: ImageCandidate, text_summary: TextSummary, content_type: str = "", content_description: str = "") -> ImageMatch:
        """
        Match a single image to a single text summary.
        
        Takes in a image candidate, text summary, and optional content_type for better captioning
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
        
        # Compute detail score and get matched words if enabled
        matched_words = ""
        caption_match_score = 0.0
        if self.use_detail_verification:
            detail_score, matched_words, caption_match_score = self.compute_detail_verification_score(
                image, image_candidate.image_id, text_summary.text_content, content_type, content_description
            )
        else:
            detail_score = 0.0 #this gets weighted as 0 anyway        
        
        # Gemini vision analysis for richer detail and alignment scoring
        gemini_analysis = self.analyze_image_with_gemini(
            image, image_candidate.image_id, text_summary.text_content
        )
        
        # Compute weighted combined score
        combined_score = (
            self.timestamp_weight * timestamp_score +
            self.semantic_weight * semantic_score +
            self.detail_weight * detail_score
        )
        
        # Get caption and OCR from cache if available (include content_type and description in cache key)
        cache_key = f"{image_candidate.image_id}_{content_type}_{content_description[:50]}"
        caption = self._caption_cache.get(cache_key, self._caption_cache.get(image_candidate.image_id, ""))
        ocr_text = self._ocr_cache.get(image_candidate.image_id, "")
        
        return ImageMatch(
            image_id=image_candidate.image_id,
            summary_id=text_summary.summary_id,
            timestamp_score=timestamp_score,
            semantic_score=semantic_score,
            detail_score=detail_score,
            combined_score=combined_score,
            caption=caption,
            ocr_text=ocr_text,
            matched_words=matched_words,
            caption_match_score=caption_match_score,
            gemini_description=gemini_analysis.get("description", ""),
            gemini_quality_score=gemini_analysis.get("quality_score", 0.0),
            gemini_text_match_score=gemini_analysis.get("text_match_score", 0.0),
            gemini_raw_response=gemini_analysis.get("raw", "")
        )
    
    def match_images_to_summary(self, text_summary: TextSummary, image_candidates: List[ImageCandidate], top_k: int = 3, content_type: str = "", content_description: str = "") -> List[ImageMatch]:
        """
        Find the best matching images for a single text summary.
        
        Given a text summary and a list of image candidates, it finds the best (top_k) matching images for the text summary.
        Note: BLIP-2 captions and OCR text are cached per image to avoid redundant computation (O(N) instead of O(N*M)).
        
        Args:
            content_type: Type of content (e.g., "keynote") for better BLIP-2 captioning
            content_description: User's brief description of the content
        """
        #array to store the matches
        matches = []
        
        print(f"\nMatching {len(image_candidates)} images to summary '{text_summary.summary_id}'...")
        if content_type:
            print(f"Content type: {content_type}")
        if content_description:
            print(f"Content description: {content_description[:100]}")
        
        for candidate in image_candidates:
            # make sure we only considering images from the same video
            if candidate.video_id != text_summary.video_id:
                continue
            
            try:
                #Get the image match and add it to the array
                match = self.match_single_pair(candidate, text_summary, content_type, content_description)
                matches.append(match)
            except Exception as e:
                print(f"Error matching image {candidate.image_id}: {e}")
                continue
        
        # Sort by combined score (descending)
        matches.sort(key=lambda x: x.combined_score, reverse=True)
        
        # Return top-k
        return matches[:top_k]
    
    def match_summaries_to_images(self, text_summaries: List[TextSummary], image_candidates: List[ImageCandidate], top_k: int = 3, content_type: str = "", content_description: str = "") -> Dict[str, List[ImageMatch]]:
        """
        Match all text summaries to their best matching images.
        Given list of TextSummary objects, list of ImageCandidate objects and top_k
        Returns Dictionary mapping summary_id to list of top-k ImageMatch objects
        Note: BLIP-2 captions and OCR text are cached per image to avoid redundant computation (O(N) instead of O(N*M)).
        
        Args:
            content_type: Type of content (e.g., "keynote") for better BLIP-2 captioning
            content_description: User's brief description of the content
        """
        results = {}
        
        print(f"\nMatching {len(text_summaries)} summaries to {len(image_candidates)} images...")
        
        for i, summary in enumerate(text_summaries):
            print(f"Processing summary: {summary.summary_id}")
            matches = self.match_images_to_summary(summary, image_candidates, top_k, content_type, content_description)
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
        self._gemini_cache.clear()
        print(f"Cache cleared: {len(self._caption_cache)} captions, {len(self._ocr_cache)} OCR texts, {len(self._gemini_cache)} Gemini analyses")
    
    def get_cache_stats(self) -> Dict[str, int]:
        """
        Get statistics about cache usage.
        Returns dict with number of cached captions and OCR texts.
        """
        return {
            "cached_captions": len(self._caption_cache),
            "cached_ocr_texts": len(self._ocr_cache),
            "cached_gemini": len(self._gemini_cache)
        }
    
#BAAAAAAANG!!!!
