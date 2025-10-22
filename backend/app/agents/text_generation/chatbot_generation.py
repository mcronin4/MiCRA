from ...llm.gemini import query_gemini

def generate_chatbot_response(user_message: str):
    prompt = f"""
You are MICRAi, a helpful assistant for creating social media content.
Respond to the user's message in a professional and helpful tone. Do not use emojis.

User message: {user_message}
"""
    return query_gemini(prompt)
