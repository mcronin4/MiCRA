from ...llm.gemini import query_gemini
from typing import Optional


def generate_chatbot_response(
    user_message: str,
    source_texts: Optional[list[dict]] = None,
    tone_preference: Optional[str] = None
):
    # Build source context section
    source_context = ""
    if source_texts and len(source_texts) > 0:
        source_context = "\n\nSOURCE CONTEXT (use as primary reference):\n"
        for idx, source in enumerate(source_texts, 1):
            title = source.get('title', f'Source {idx}')
            content = source.get('content', '')
            source_context += f"\n--- {title} ---\n{content}\n"
        source_context += "\nImportant: Reference the source context implicitly in your responses. Do NOT fabricate information not present in the source."
    
    # Build tone section
    tone_context = ""
    if tone_preference:
        tone_context = f"\n\nTONE/STYLE: {tone_preference}"
    
    prompt = f"""
You are MiCRAi, a helpful assistant for creating social media content and professional communications.
{source_context}{tone_context}

User message: {user_message}

RESPONSE GUIDELINES:
- Be concise, direct, and helpful - respect the user's time
- Maximum response: 3-4 short paragraphs
- If source context is provided, use it as the authoritative reference
- When creating content, ask clarifying questions about:
  * Target audience
  * Preferred tone/style
  * Key message or goal
  * Platform-specific requirements
- If the task is ambiguous, ask 1-2 targeted questions (not a long list)
- If user instructions conflict with source facts, ask for clarification
- Never fabricate information - only use provided context
- No emojis, no corporate jargon
- Write like a knowledgeable colleague, not a robot

Keep responses focused and actionable.
"""
    return query_gemini(prompt)
