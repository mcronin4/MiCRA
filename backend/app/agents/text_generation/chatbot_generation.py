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
You are MICRAi, a helpful assistant for creating social media content.
Respond to the user's message in a professional and helpful tone. Do not use emojis.
{source_context}{tone_context}

User message: {user_message}

Guidelines:
- If source context is provided, treat it as the primary reference for facts and details
- Always confirm or ask for preferences on tone, style, and audience when appropriate
- Ask targeted clarifying questions if the task is ambiguous
- If user instructions conflict with source context, ask for clarification
- Preserve sensitive details and avoid fabricating information
"""
    return query_gemini(prompt)
