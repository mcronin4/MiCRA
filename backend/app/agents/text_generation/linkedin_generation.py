# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini
from typing import Optional


def generate_linkedin_post(
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
Create a concise, engaging LinkedIn post about the following topic:

CONTENT:
{source_context}

STRICT REQUIREMENTS:
- Maximum length: 1,200 characters (firm limit)
- Target length: 800-1,000 characters for optimal engagement
- 3-5 short paragraphs maximum
- Each paragraph: 1-2 sentences only

STRUCTURE:
1. Hook (1 sentence): Start with a compelling question, surprising insight, or bold statement
2. Core value (2-3 sentences): Share ONE key insight, lesson, or actionable takeaway
3. Brief context/story (optional, 1-2 sentences): Add relatability if relevant
4. Call-to-action (1 sentence): End with an engaging question or clear next step

STYLE:
- {tone_guidance}
- Write like a human, not an AI
- Use conversational language, avoid corporate jargon
- Be specific and concrete, not vague or generic
- NO asterisks (***), NO dashes for emphasis, NO overused phrases
- Optional: 2-3 relevant hashtags only if they add value

{"CRITICAL: Extract key points from source context. Stay factual. Do not fabricate." if source_context else ""}

Output ONLY the post content. No preamble, no explanations.
"""
    return query_gemini(prompt)
