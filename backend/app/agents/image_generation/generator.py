"""
Image generation service using Gemini API's native image generation.
"""
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os
import base64
from typing import Optional, Tuple

load_dotenv()

gemini_api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=gemini_api_key)


def generate_image_from_text(
    prompt: str,
    aspect_ratio: str = "1:1"
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate an image from a text prompt.
    
    Args:
        prompt: Text description of the image to generate
        aspect_ratio: Aspect ratio ("1:1", "16:9", "9:16", "4:3", "3:4")
    
    Returns:
        Tuple of (base64_image_data, error_message)
        - On success: (base64_string, None)
        - On failure: (None, error_message)
    """
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=['Image'],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio,
                )
            )
        )
        
        # Extract image from response
        for part in response.parts:
            if part.inline_data is not None:
                # Return base64 encoded image with data URL prefix
                mime_type = part.inline_data.mime_type or "image/png"
                image_data = base64.b64encode(part.inline_data.data).decode('utf-8')
                return f"data:{mime_type};base64,{image_data}", None
        
        return None, "No image was generated"
        
    except Exception as e:
        return None, str(e)


def generate_image_from_image(
    prompt: str,
    input_image_base64: str,
    aspect_ratio: str = "1:1"
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate a new image based on an input image and text prompt.
    
    Args:
        prompt: Text description of the desired output
        input_image_base64: Base64-encoded input image (with or without data URL prefix)
        aspect_ratio: Aspect ratio ("1:1", "16:9", "9:16", "4:3", "3:4")
    
    Returns:
        Tuple of (base64_image_data, error_message)
        - On success: (base64_string, None)
        - On failure: (None, error_message)
    """
    try:
        # Strip data URL prefix if present
        if input_image_base64.startswith('data:'):
            # Extract the base64 part after the comma
            input_image_base64 = input_image_base64.split(',', 1)[1]
        
        # Decode the base64 image
        image_bytes = base64.b64decode(input_image_base64)
        
        # Create the content with image and text
        contents = [
            prompt,
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png"  # Assume PNG, works for most images
            )
        ]
        
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=['Image'],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio,
                )
            )
        )
        
        # Extract image from response
        for part in response.parts:
            if part.inline_data is not None:
                mime_type = part.inline_data.mime_type or "image/png"
                image_data = base64.b64encode(part.inline_data.data).decode('utf-8')
                return f"data:{mime_type};base64,{image_data}", None
        
        return None, "No image was generated"
        
    except Exception as e:
        return None, str(e)
