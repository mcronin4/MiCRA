# This will be used to generate emails based on the topic/message or a provided summary.
from typing import Optional, List, Dict

from ...llm.gemini import query_gemini


def generate_email(
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
You are writing an email that may be sent by either an individual or a brand/organization. Keep it human, direct, and grounded in the provided context.

SOURCE CONTEXT (primary reference; do not invent details):
{source_context if source_context else "No source context provided."}

STRICT REQUIREMENTS:
- Maximum email body: 800 characters
- Subject line: 6-8 words maximum, compelling and clear
- 2-4 short paragraphs in body
- Each paragraph: 2-3 sentences maximum
- No bullet points, no numbered lists, no emojis

STRUCTURE:
1. Subject line: Clear, specific, action-oriented
2. Greeting: Simple and appropriate (e.g., "Hi [Name]," or "Hello,")
3. Opening (1 sentence): State purpose immediately
4. Body (2-4 sentences): Provide essential details and value
5. Close (1-2 sentences): Clear call-to-action or next steps
6. Sign-off: Professional (e.g., "Best," "Thanks," "Best regards,")

CRITICAL RULES:
- State the purpose in the first sentence.
- Prefer short concrete sentences. Avoid polite filler; every sentence must add new information
- Include 1–3 concrete details from the source when available (names, dates, numbers, specific ask, specific outcome).
- If the source lacks details, do NOT fabricate. Use placeholders like [date], [link], [doc], or write a general request without specifics.
- Remove any sentence that could be copied into a different email without changing meaning.

STYLE:
- {tone_guidance}
- Scannable, respectful, confident
- Use plain language, not corporate template tone

STRUCTURE (must follow):
1) SUBJECT: specific + action-oriented
2) GREETING: "Hi [Name]," or "Hello," (if unknown)
3) OPENING: 1 sentence stating purpose
4) BODY: 2–4 sentences with necessary details + a clear ask
5) CLOSE: 1 sentence confirming next step or deadline (if known)
6) SIGN-OFF: "Best," / "Thanks," / "Best regards,"

OUTPUT FORMAT (exactly):
SUBJECT: ...
---
Hi [Name],
[body...]
Best,
[Name/Team]
"""
    return query_gemini(prompt)
