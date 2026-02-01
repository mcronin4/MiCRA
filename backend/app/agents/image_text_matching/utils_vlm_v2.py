"""
Utility functions for VLM-based image-text matching.

Provides common functions for base64 encoding, image processing,
and response parsing.
"""

import base64
import re
from typing import Optional
from PIL import Image
import io


def image_to_base64(filepath: str, max_dimension: Optional[int] = None) -> str:
    """
    Load image from filepath and convert to base64 data URL.
    
    Args:
        filepath: Path to image file
        max_dimension: Optional maximum dimension for downsampling (maintains aspect ratio)
                      If None, uses original image size
    
    Returns:
        Base64-encoded data URL string (e.g., "data:image/jpeg;base64,...")
    
    Example:
        >>> base64_url = image_to_base64("test.jpg", max_dimension=1024)
    """
    # Load image
    image = Image.open(filepath)
    
    # Convert to RGB if needed (handles RGBA, grayscale, etc.)
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Optional downsampling
    if max_dimension and (image.width > max_dimension or image.height > max_dimension):
        ratio = max_dimension / max(image.width, image.height)
        new_size = (int(image.width * ratio), int(image.height * ratio))
        image = image.resize(new_size, Image.Resampling.LANCZOS)
        print(f"  Downsampled image from {Image.open(filepath).size} to {new_size}")
    
    # Convert to base64
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=95)
    image_bytes = buffer.getvalue()
    base64_str = base64.b64encode(image_bytes).decode('utf-8')
    
    # Return as data URL
    return f"data:image/jpeg;base64,{base64_str}"


def parse_numeric_response(response: str) -> float:
    """
    Extract numeric value from VLM response.
    
    Handles various response formats:
    - "95"
    - "The score is 95"
    - "95.5"
    - "Score: 87/100"
    
    Args:
        response: VLM response text
    
    Returns:
        Extracted numeric value as float
    
    Raises:
        ValueError: If no number can be extracted from response
    
    Example:
        >>> parse_numeric_response("The similarity score is 87")
        87.0
    """
    # Try to convert directly first
    try:
        return float(response.strip())
    except ValueError:
        pass
    
    # Extract first number using regex (handles decimals)
    numbers = re.findall(r'\d+\.?\d*', response)
    
    if not numbers:
        raise ValueError(f"Could not extract numeric value from response: {response}")
    
    return float(numbers[0])


def format_image_content(image_base64: str, text: str) -> list:
    """
    Format image and text into Fireworks API message content structure.
    
    Args:
        image_base64: Base64-encoded image data URL
        text: Text prompt
    
    Returns:
        List of content items formatted for Fireworks API
    
    Example:
        >>> content = format_image_content(base64_url, "Describe this image")
    """
    return [
        {"type": "image_url", "image_url": {"url": image_base64}},
        {"type": "text", "text": text}
    ]


