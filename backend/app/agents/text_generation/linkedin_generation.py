# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini


def generate_linkedin_post(topic: str):
    prompt = f"""
Create a professional LinkedIn post about the following topic or message:

Topic: {topic}

LinkedIn Post Guidelines:
- Start with a compelling hook that grabs attention (question, surprising fact, or bold statement)
- Use short paragraphs (1-2 sentences each) for easy mobile reading
- Include line breaks between paragraphs for visual breathing room
- Write in a professional yet conversational tone
- Share value: insights, lessons learned, or actionable advice
- Be authentic and relatable
- End with a call-to-action or thought-provoking question to encourage engagement
- Maximum length: 2,900 characters
- Optional: Include 3-5 relevant hashtags at the end (but only if they feel natural)

Format the post with proper spacing and structure. Make it engaging and valuable for a professional audience.

Output ONLY the post content, nothing else.
"""
    return query_gemini(prompt)
