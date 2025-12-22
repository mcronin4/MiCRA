from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Literal, Tuple
import base64
import tempfile
import os
import asyncio
from fireworks.client import AsyncFireworks

router = APIRouter(prefix="/image-matching")

class ImageWithId(BaseModel):
    id: str
    base64: str

class ImageMatchRequest(BaseModel):
    images: List[ImageWithId]  # Images with unique IDs
    text: str
    max_dimension: Optional[int] = 1024

class ImageMatchResult(BaseModel):
    image_id: str
    status: Literal['success', 'failed']
    combined_score: Optional[float] = None
    semantic_score: Optional[float] = None
    detail_score: Optional[float] = None
    error: Optional[str] = None

class ImageMatchResponse(BaseModel):
    success: bool
    results: List[ImageMatchResult]
    error: Optional[str] = None

def base64_to_temp_file(base64_string: str) -> str:
    """Convert base64 data URL to temp file."""
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    image_data = base64.b64decode(base64_string)
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
    temp_file.write(image_data)
    temp_file.close()
    return temp_file.name

async def process_single_image(
    image_with_id: ImageWithId,
    matcher,
    text_summary
) -> Tuple[ImageMatchResult, Optional[str]]:
    """Process a single image asynchronously and return result with status and temp file path."""
    temp_path = None
    try:
        from ...agents.image_text_matching.types import ImageCandidate
        
        # Convert base64 to temp file
        temp_path = base64_to_temp_file(image_with_id.base64)
        
        # Create image candidate
        image_candidate = ImageCandidate(image_id=image_with_id.id, filepath=temp_path)
        
        # Match single image using shared matcher
        match = await matcher.match_single_pair(image_candidate, text_summary)
        
        result = ImageMatchResult(
            image_id=image_with_id.id,
            status='success',
            combined_score=match.combined_score,
            semantic_score=match.semantic_score,
            detail_score=match.detail_score
        )
        return (result, temp_path)
    except Exception as e:
        print(f"Error processing image {image_with_id.id}: {e}")
        import traceback
        traceback.print_exc()
        result = ImageMatchResult(
            image_id=image_with_id.id,
            status='failed',
            error=str(e)
        )
        return (result, temp_path)

@router.post("", response_model=ImageMatchResponse)
async def match_images_to_text(request: ImageMatchRequest):
    temp_files = []
    
    try:
        from ...agents.image_text_matching.vlm_analysis import ImageTextMatcherVLM
        from ...agents.image_text_matching.types import TextSummary
        from ...agents.image_text_matching.config_vlm import VLMConfig
        
        # Create text summary
        text_summary = TextSummary(summary_id="input", text_content=request.text)
        
        # Use AsyncFireworks client as context manager for automatic cleanup
        async with AsyncFireworks(api_key=VLMConfig.get_api_key()) as client:
            # Create matcher with the context-managed client
            matcher = ImageTextMatcherVLM(
                max_image_dimension=request.max_dimension,
                client=client
            )
            
            # Process all images in parallel using asyncio.gather
            tasks = [
                process_single_image(img, matcher, text_summary)
                for img in request.images
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Handle any exceptions that weren't caught and collect temp files
            processed_results = []
            for result in results:
                if isinstance(result, Exception):
                    # This shouldn't happen, but handle it just in case
                    processed_results.append(ImageMatchResult(
                        image_id="unknown",
                        status='failed',
                        error=str(result)
                    ))
                else:
                    match_result, temp_path = result
                    processed_results.append(match_result)
                    if temp_path:
                        temp_files.append(temp_path)
            
            return ImageMatchResponse(success=True, results=processed_results)
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return ImageMatchResponse(success=False, results=[], error=str(e))
    
    finally:
        # Clean up temp files
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except Exception:
                pass

