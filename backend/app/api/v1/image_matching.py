from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import base64
import tempfile
import os

router = APIRouter(prefix="/image-matching")

class ImageMatchRequest(BaseModel):
    images: List[str]  # Base64 data URLs
    text: str
    max_dimension: Optional[int] = 1024

class ImageMatchResult(BaseModel):
    image_index: int
    score: float
    semantic_score: float
    detail_scores: dict

class ImageMatchResponse(BaseModel):
    success: bool
    matches: List[ImageMatchResult]
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

@router.post("/", response_model=ImageMatchResponse)
async def match_images_to_text(request: ImageMatchRequest):
    temp_files = []
    
    try:
        from ...agents.image_text_matching.vlm_analysis import ImageTextMatcherVLM
        from ...agents.image_text_matching.embeddings import TextSummary, ImageCandidate
        
        matcher = ImageTextMatcherVLM(max_image_dimension=request.max_dimension)
        
        # Convert base64 to temp files
        image_paths = []
        for base64_img in request.images:
            temp_path = base64_to_temp_file(base64_img)
            temp_files.append(temp_path)
            image_paths.append(temp_path)
        
        # Create inputs
        text_summary = TextSummary(text_id="input", text_content=request.text)
        image_candidates = [
            ImageCandidate(image_id=f"img_{i}", filepath=path)
            for i, path in enumerate(image_paths)
        ]
        
        # Match
        matches = matcher.match_images_to_text(text_summary, image_candidates)
        
        # Format response
        results = [
            ImageMatchResult(
                image_index=i,
                score=match.score,
                semantic_score=match.semantic_score,
                detail_scores=match.detail_scores
            )
            for i, match in enumerate(matches)
        ]
        
        return ImageMatchResponse(success=True, matches=results)
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return ImageMatchResponse(success=False, matches=[], error=str(e))
    
    finally:
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except:
                pass

