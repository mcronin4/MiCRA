from google import genai
from dotenv import load_dotenv
from pathlib import Path
import os

# Load .env from the backend directory (parent of app/)
_backend_dir = Path(__file__).parent.parent.parent
_env_path = _backend_dir / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()  # Fallback to default behavior
from typing import Optional, Dict, Any
import json

gemini_api_key = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=gemini_api_key)

def query_gemini(
    prompt: str,
    response_schema: Optional[Dict[str, Any]] = None,
    response_mime_type: Optional[str] = None
):
    """
    Query Gemini API with optional structured output support.
    
    Args:
        prompt: The prompt text
        response_schema: Optional JSON schema for structured output
        response_mime_type: Optional MIME type (e.g., "application/json")
    
    Returns:
        Generated text, or parsed JSON if schema is provided
    """
    # Call the API - pass response_schema and response_mime_type directly if provided
    if response_schema is not None:
        # Try with structured output parameters
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                response_schema=response_schema,
                response_mime_type=response_mime_type or "application/json"
            )
        except TypeError:
            # If that doesn't work, fall back to plain text and parse manually
            # Add instruction to output JSON in the prompt
            json_prompt = f"{prompt}\n\nIMPORTANT: Output your response as valid JSON matching this schema: {json.dumps(response_schema)}"
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=json_prompt
            )
    else:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
    
    # If schema was provided, parse JSON response
    if response_schema is not None:
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present (```json ... ```)
        if response_text.startswith('```'):
            # Extract JSON from markdown code block
            lines = response_text.split('\n')
            # Remove first line (```json or ```)
            if lines[0].startswith('```'):
                lines = lines[1:]
            # Remove last line (```)
            if lines and lines[-1].strip() == '```':
                lines = lines[:-1]
            response_text = '\n'.join(lines)
        
        # Try to parse as JSON
        try:
            parsed = json.loads(response_text)
            # Ensure it's a dict
            if isinstance(parsed, dict):
                return parsed
            else:
                # If it's not a dict, wrap it
                return {"content": parsed}
        except json.JSONDecodeError as e:
            # If JSON parsing fails, try to extract JSON from the text
            import re
            # Try to find JSON object in the text
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    pass
            
            # Last resort: wrap the text in a dict
            return {"content": response_text}
    
    return response.text