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
Create a professional email about the following topic or message:

Topic: {topic}
{source_context}

Email Guidelines:
- Start with an appropriate greeting (e.g., "Hi [Name]," or "Hello,")
- Open with a clear and engaging first sentence that states the purpose
- Keep paragraphs short (2-3 sentences max) for easy scanning
- {tone_guidance}
- Be concise and to the point - respect the recipient's time
- Include specific details or value
- End with a clear call-to-action or next steps
- Close with an appropriate sign-off (e.g., "Best regards," or "Thank you,")
- Maximum length: 1,500 characters

{"- If source context is provided, reflect key details from it while maintaining email structure" if source_context else ""}
{"- Preserve sensitive details and do not fabricate information" if source_context else ""}

Format the email with proper structure and spacing. Make it professional, clear, and actionable.

Output in this EXACT format:
SUBJECT: [compelling subject line here]
---
[email body including greeting and sign-off]
"""
    return query_gemini(prompt)
