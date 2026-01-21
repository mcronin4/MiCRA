"""
Image generation API endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from ...agents.image_generation.generator import generate_image_from_text, generate_image_from_image

router = APIRouter(prefix="/image-generation", tags=["image-generation"])


class GenerateImageRequest(BaseModel):
    """Request model for image generation."""
    prompt: str = Field(..., min_length=1)
    input_image: Optional[str] = None  # Base64 encoded image (optional, for image-to-image)
    aspect_ratio: str = Field("1:1", pattern=r"^(1:1|16:9|9:16|4:3|3:4)$")


class GenerateImageResponse(BaseModel):
    """Response model for image generation."""
    success: bool
    image_base64: Optional[str] = None  # Full data URL with base64 image
    error: Optional[str] = None


@router.post("/generate", response_model=GenerateImageResponse)
async def generate_image(request: GenerateImageRequest):
    """
    Generate an image using Gemini API.
    
    - If `input_image` is provided, performs image-to-image editing
    - If only `prompt` is provided, performs text-to-image generation
    """
    try:
        if request.input_image:
            # Image-to-image editing
            image_data, error = generate_image_from_image(
                prompt=request.prompt,
                input_image_base64=request.input_image,
                aspect_ratio=request.aspect_ratio
            )
        else:
            # Text-to-image generation
            image_data, error = generate_image_from_text(
                prompt=request.prompt,
                aspect_ratio=request.aspect_ratio
            )
        
        if error:
            return GenerateImageResponse(
                success=False,
                error=error
            )
        
        return GenerateImageResponse(
            success=True,
            image_base64=image_data
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
