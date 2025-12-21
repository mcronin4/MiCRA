# This will be used to generate emails based on the topic/message or a provided summary.
from typing import Optional, List, Dict

from ...llm.gemini import query_gemini

#  raw_content = generator(instruction, source_texts, tone)


def generate_email(
    topic: Optional[str] = None,
    source_texts: Optional[List[Dict]] = None,
    tone_preference: Optional[str] = None
):
    """
    Generate a professional email grounded in provided context.

    Arguments:
        topic: High-level topic or subject to cover.
        summary: Optional textual summary to use when a topic is not provided.
        source_texts: Optional structured sources with `title` and `content`.
        tone_preference: Optional tone/style instruction.
    """

    topic_text = topic or "Update based on provided context"

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

Topic: {topic_text}
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
