# This will be used to generate emails based on the topic/message
from ...llm.gemini import query_gemini
from typing import Optional


def generate_email(
    topic: str,
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
        source_context += "\nImportant: Use the source context as your primary reference. Extract key points and details from it. Do NOT fabricate information not present in the source. Maintain consistency with source facts."
    
    # Build tone section
    tone_guidance = "Use a professional yet friendly tone"
    if tone_preference:
        tone_guidance = f"Tone/Style to use: {tone_preference}"
    
    prompt = f"""
Create a professional email about the following topic:

Topic: {topic}
{source_context}

STRICT REQUIREMENTS:
- Maximum email body: 800 characters
- Subject line: 6-8 words maximum, compelling and clear
- 2-4 short paragraphs in body
- Each paragraph: 2-3 sentences maximum

STRUCTURE:
1. Subject line: Clear, specific, action-oriented
2. Greeting: Simple and appropriate (e.g., "Hi [Name]," or "Hello,")
3. Opening (1 sentence): State purpose immediately
4. Body (2-4 sentences): Provide essential details and value
5. Close (1-2 sentences): Clear call-to-action or next steps
6. Sign-off: Professional (e.g., "Best," "Thanks," "Best regards,")

STYLE:
- {tone_guidance}
- Be direct and scannable - no fluff
- Use specific details, not generic statements
- Respect the recipient's time
- Write like a human colleague, not a corporate template

{"CRITICAL: Use source context for factual details. Do not fabricate." if source_context else ""}

Output in this EXACT format:
SUBJECT: [compelling subject line]
---
[email body including greeting and sign-off]
"""
    return query_gemini(prompt)
