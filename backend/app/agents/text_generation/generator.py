"""
Unified text generation service using Supabase-stored presets.
"""
from typing import Optional, List, Dict, Any
import json
from ...llm.gemini import query_gemini
from ...db.supabase import get_supabase


def build_source_context(source_texts: Optional[List[Dict[str, Any]]]) -> str:
    """Build source context string from source texts."""
    if not source_texts or len(source_texts) == 0:
        return ""
    
    source_context = "\n\nSOURCE CONTEXT (use as primary reference):\n"
    for idx, source in enumerate(source_texts, 1):
        title = source.get('title', f'Source {idx}')
        content = source.get('content', '')
        source_context += f"\n--- {title} ---\n{content}\n"
    source_context += "\nImportant: Use the source context as your primary reference. Extract key points and details from it. Do NOT fabricate information not present in the source. Maintain consistency with source facts."
    
    return source_context


def build_prompt(
    preset_prompt: str,
    input_text: str,
    source_context: str,
    tone_guidance: Optional[str] = None
) -> str:
    """
    Build the final prompt by combining preset template with input text and context.
    
    Args:
        preset_prompt: The prompt template from the preset
        input_text: User-provided input text
        source_context: Formatted source context string
        tone_guidance: Optional tone guidance from preset
    
    Returns:
        Complete prompt string ready for LLM
    """
    # Replace placeholders in preset prompt
    prompt = preset_prompt
    
    # Build combined content: input_text is primary, source_context is supplementary
    combined_content = input_text
    if source_context:
        combined_content = f"{source_context}\n\nADDITIONAL INPUT:\n{input_text}"
    
    # Replace {source_context} placeholder with combined content
    # (presets may use {source_context} to mean "the content to generate from")
    if "{source_context}" in prompt:
        prompt = prompt.replace("{source_context}", combined_content)
    elif "{input_text}" in prompt:
        prompt = prompt.replace("{input_text}", input_text)
    else:
        # If no placeholder, prepend combined content
        prompt = f"{combined_content}\n\n{prompt}"
    
    # Replace {tone_guidance} placeholder
    tone_text = tone_guidance or "Use a professional yet conversational tone"
    if "{tone_guidance}" in prompt:
        prompt = prompt.replace("{tone_guidance}", tone_text)
    
    return prompt


def generate_text(
    input_text: str,
    preset_id: str,
    source_texts: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Generate text using a preset from Supabase.
    
    Args:
        input_text: The input text to generate from
        preset_id: UUID of the preset to use
        source_texts: Optional list of source texts with 'title' and 'content' keys
    
    Returns:
        Dictionary containing generated text in the format specified by the preset's output_format
    
    Raises:
        ValueError: If preset not found or invalid
        Exception: If generation fails
    """
    # Get preset from Supabase
    supabase = get_supabase()
    preset_result = supabase.client.table("text_generation_presets").select("*").eq("id", preset_id).execute()
    
    if not preset_result.data or len(preset_result.data) == 0:
        raise ValueError(f"Preset with id {preset_id} not found")
    
    preset = preset_result.data[0]
    
    # Extract preset fields
    prompt_template = preset.get("prompt", "")
    output_format = preset.get("output_format")
    tone_guidance = preset.get("tone_guidance")
    max_length = preset.get("max_length")
    
    # Build source context
    source_context = build_source_context(source_texts)
    
    # Build final prompt
    final_prompt = build_prompt(prompt_template, input_text, source_context, tone_guidance)
    
    # Add max length constraint to prompt if specified
    if max_length:
        final_prompt = f"{final_prompt}\n\nIMPORTANT: Maximum output length is {max_length} characters."
    
    # Generate using Gemini with structured output if schema is provided
    if output_format:
        # Convert output_format from dict/JSONB to dict if needed
        if isinstance(output_format, str):
            output_format = json.loads(output_format)
        
        generated_output = query_gemini(
            final_prompt,
            response_schema=output_format,
            response_mime_type="application/json"
        )
    else:
        # Fallback to plain text generation
        generated_output = query_gemini(final_prompt)
        # Wrap in a simple structure
        generated_output = {"content": generated_output}
    
    return generated_output

