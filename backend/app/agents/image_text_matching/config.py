"""
Configuration for SITMA

"""

from typing import Dict, Any


class MatchingConfig:
    """Configuration for ImageTextMatcher"""
   
    # Model names
    SIGLIP_MODEL = "google/siglip-so400m-patch14-384"
    BLIP2_MODEL = "Salesforce/blip2-opt-2.7b"
    
    # Scoring weights (must sum to 1.0), need to be adjusted for content type and configured from testing.
    DEFAULT_TIMESTAMP_WEIGHT = 0.3
    DEFAULT_SEMANTIC_WEIGHT = 0.5
    DEFAULT_DETAIL_WEIGHT = 0.2
    
    # Timestamp matching settings
    USE_TIMESTAMP_MATCHING = True  # Set to False if text summaries don't have timestamps
    DEFAULT_TIMESTAMP_WINDOW = 5.0  # seconds - how far an image can be from the text segment to considered a match

    # Detail verification settings
    USE_DETAIL_VERIFICATION = True
    
    # ocr settings, optional and can be disabled, only good for images with text/slides, so not needed for all content.
    USE_OCR = True
    OCR_LANGUAGE = 'eng'  # Tesseract language code, many need to change if different language..
    TESSERACT_CMD = None  # Set to tesseract.exe path if auto-detection fails (e.g., r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    
    # Inference settings
    BLIP2_MAX_LENGTH = 50 #How long image captions will be.
    BATCH_SIZE = 1  #If I want to add batching later, could be possible.
    
    # Device settings
    AUTO_DEVICE = True  # CUDA if available
    DEFAULT_DEVICE = 'cpu'
    
    # Images to return, default is 3
    DEFAULT_TOP_K = 3
    
    # MIGHT REMOVE THIS
    VISUAL_KEYWORDS = [
        'chart', 'graph', 'slide', 'diagram', 'table', 'screen',
        'presenter', 'speaker', 'stage', 'logo', 'image', 'photo',
        'dashboard', 'report', 'visualization', 'plot', 'figure',
        'bar', 'line', 'pie', 'scatter', 'histogram', 'infographic',
        'screenshot', 'display', 'monitor', 'projection', 'board'
    ]
    
    #Use a @classmethod becuase this is not instance specific, so we can use it without creating an instance of the class.
    @classmethod
    def get_default_config(cls) -> Dict[str, Any]:  
        #dict for default configuration values
        return {
            'siglip_model': cls.SIGLIP_MODEL,
            'blip2_model': cls.BLIP2_MODEL,
            'timestamp_weight': cls.DEFAULT_TIMESTAMP_WEIGHT,
            'semantic_weight': cls.DEFAULT_SEMANTIC_WEIGHT,
            'detail_weight': cls.DEFAULT_DETAIL_WEIGHT,
            'use_timestamp_matching': cls.USE_TIMESTAMP_MATCHING,
            'timestamp_window': cls.DEFAULT_TIMESTAMP_WINDOW,
            'use_detail_verification': cls.USE_DETAIL_VERIFICATION,
            'use_ocr': cls.USE_OCR,
            'ocr_language': cls.OCR_LANGUAGE,
            'blip2_max_length': cls.BLIP2_MAX_LENGTH,
            'batch_size': cls.BATCH_SIZE,
            'auto_device': cls.AUTO_DEVICE,
            'default_device': cls.DEFAULT_DEVICE,
            'default_top_k': cls.DEFAULT_TOP_K,
            'visual_keywords': cls.VISUAL_KEYWORDS
        }
    
    @classmethod
    def validate_weights(cls, timestamp_w: float, semantic_w: float, detail_w: float) -> bool:
        
        #Make sure the weights sum to 1.0, if not wont work
        total = timestamp_w + semantic_w + detail_w
        return abs(total - 1.0) < 1e-6


class PresetConfigurations:
   #Preset configurations for different use cases
    
    @staticmethod
    def timestamp_priority() -> Dict[str, float]:

        #when timestamp alignment is most important
        return {
            'timestamp_weight': 0.6,
            'semantic_weight': 0.3,
            'detail_weight': 0.1
        }
    
    @staticmethod
    def semantic_priority() -> Dict[str, float]:

        #when content relevance is most important
        return {
            'timestamp_weight': 0.1,
            'semantic_weight': 0.7,
            'detail_weight': 0.2
        }
    
    @staticmethod
    def detail_priority() -> Dict[str, float]:
        #when specific visual elements are explicitly mentioned, slide decks, charts, technical presentations
        return {
            'timestamp_weight': 0.2,
            'semantic_weight': 0.3,
            'detail_weight': 0.5
        }
    
    @staticmethod
    def balanced() -> Dict[str, float]:

        #Balance configuration (default).
        return {
            'timestamp_weight': 0.33,
            'semantic_weight': 0.34,
            'detail_weight': 0.33
        }


#I just put in some example configurations for different content types, but we can add more for different types
PLATFORM_SPECIFIC_CONFIGS = {
    'webinar': {
        'description': 'For webinar/presentation content with slides',
        'weights': {
            'timestamp_weight': 0.25,
            'semantic_weight': 0.45,
            'detail_weight': 0.30
        },
        'settings': {
            'timestamp_window': 8.0,
            'use_ocr': True,
            'top_k': 3
        }
    },
    'product_demo': {
        'description': 'For product demonstrations with UI screenshots',
        'weights': {
            'timestamp_weight': 0.20,
            'semantic_weight': 0.50,
            'detail_weight': 0.30
        },
        'settings': {
            'timestamp_window': 6.0,
            'use_ocr': True,
            'top_k': 3
        }
    },
    'conference_talk': {
        'description': 'For conference presentations with speaker on stage',
        'weights': {
            'timestamp_weight': 0.35,
            'semantic_weight': 0.40,
            'detail_weight': 0.25
        },
        'settings': {
            'timestamp_window': 10.0,
            'use_ocr': True,
            'top_k': 3
        }
    },
    'podcast_video': {
        'description': 'For podcast videos with minimal visual changes',
        'weights': {
            'timestamp_weight': 0.50,
            'semantic_weight': 0.40,
            'detail_weight': 0.10
        },
        'settings': {
            'timestamp_window': 15.0,
            'use_ocr': False, #dont need ocr for podcast videos
            'top_k': 1
        }
    }
}


def get_config_for_content_type(content_type: str) -> Dict[str, Any]:

    #Ges config for a specific content type, input content returns the confid dict above
    
    
    if content_type not in PLATFORM_SPECIFIC_CONFIGS:
        #we dont a config for that platform
        raise ValueError(
            f"Unknown content type '{content_type}'. "
        )
    
    config = PLATFORM_SPECIFIC_CONFIGS[content_type].copy()
    
    # Merge weights and settings
    full_config = config['weights'].copy()
    full_config.update(config['settings'])
    
    return full_config

