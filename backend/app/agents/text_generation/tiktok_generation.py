# This will be used to generate TikTok scripts based on the topic/message
from ...llm.gemini import query_gemini
from typing import Optional


def generate_tiktok_script(
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
    tone_guidance = "engaging, energetic, and attention-grabbing"
    if tone_preference:
        tone_guidance = f"{tone_preference}, while remaining engaging for TikTok"
    
    prompt = f"""
Create a TikTok video script/caption about the following topic or message:

Topic: {topic}
{source_context}

TikTok Script Guidelines:
- Start with an attention-grabbing hook (first 3 seconds are crucial!)
- Keep it short, punchy, and easy to follow
- Tone: {tone_guidance}
- Use casual, conversational language
- Include actionable tips or insights
- End with a call-to-action or engaging question
- Maximum length: 150 characters for caption
- Include 3-5 relevant hashtags

{"- If source context is provided, extract the most engaging points" if source_context else ""}
{"- Preserve key facts and do not fabricate information" if source_context else ""}

Format the script to be compelling for a short-form video platform.

Output ONLY the caption/script with hashtags, nothing else.
"""
    return query_gemini(prompt)

