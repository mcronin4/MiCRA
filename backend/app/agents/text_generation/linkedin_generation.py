# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini
from typing import Optional


def generate_linkedin_post(
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
        source_context += "\nImportant: Use the source context as your primary reference. Extract key points, insights, and details from it. Do NOT fabricate information not present in the source. Maintain consistency with source facts."
    
    # Build tone section
    tone_guidance = "Write in a professional yet conversational tone"
    if tone_preference:
        tone_guidance = f"Tone/Style to use: {tone_preference}"
    
    prompt = f"""
Create a professional LinkedIn post about the following topic or message:

Topic: {topic}
{source_context}

LinkedIn Post Guidelines:
- Start with a compelling hook that grabs attention (question, surprising fact, or bold statement)
- Use short paragraphs (1-2 sentences each) for easy mobile reading
- Include line breaks between paragraphs for visual breathing room
- {tone_guidance}
- Share value: insights, lessons learned, or actionable advice
- Be authentic and relatable
- End with a call-to-action or thought-provoking question to encourage engagement
- Maximum length: 2,900 characters
- Optional: Include 3-5 relevant hashtags at the end (but only if they feel natural)

{"- If source context is provided, reflect key details from it" if source_context else ""}
{"- Preserve sensitive details and do not fabricate information" if source_context else ""}

Format the post with proper spacing and structure. Make it engaging and valuable for a professional audience.

Output ONLY the post content, nothing else.

AVOID *** 
AVOID Dashes
AVOID GPT-like content.
AVOID AI-generated content.
AVOID ChatGPT-like content.
AVOID Bard-like content.
AVOID Claude-like content.
AVOID Gemini-like content.
AVOID DeepSeek-like content.
AVOID Perplexity-like content.
"""
    return query_gemini(prompt)
