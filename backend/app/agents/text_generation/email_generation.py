# This will be used to generate emails based on the topic/message
from ...llm.gemini import query_gemini


def generate_email(topic: str):
    prompt = f"""
Create a professional email about the following topic or message:

Topic: {topic}

Email Guidelines:
- Start with an appropriate greeting (e.g., "Hi [Name]," or "Hello,")
- Open with a clear and engaging first sentence that states the purpose
- Keep paragraphs short (2-3 sentences max) for easy scanning
- Use a professional yet friendly tone
- Be concise and to the point - respect the recipient's time
- Include specific details or value
- End with a clear call-to-action or next steps
- Close with an appropriate sign-off (e.g., "Best regards," or "Thank you,")
- Maximum length: 1,500 characters

Format the email with proper structure and spacing. Make it professional, clear, and actionable.

Output ONLY the email content (including greeting and sign-off), nothing else.
"""
    return query_gemini(prompt)
