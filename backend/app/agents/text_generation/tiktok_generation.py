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
Create a TikTok caption about the following topic:

Topic: {topic}
{source_context}

STRICT REQUIREMENTS:
- Maximum length: 300 characters (including spaces)
- Must include 3-5 relevant hashtags
- First line must hook attention in 5 words or less

STRUCTURE:
1. Hook (5 words max): Grab attention immediately
2. Value (1-2 short sentences): Deliver one punchy insight or tip
3. Engagement (1 question or CTA): Encourage comments/shares
4. Hashtags: 3-5 trending or niche-relevant tags

STYLE:
- Tone: {tone_guidance}
- Casual, conversational, no corporate speak
- Short sentences, energetic pace
- Speak directly to viewer ("you")
- Make every word count

{"CRITICAL: Extract the most engaging point from source. Stay accurate." if source_context else ""}

Output format:
[Hook]
[Value - keep it punchy]
[CTA/Question]

#hashtag1 #hashtag2 #hashtag3
"""
    return query_gemini(prompt)

