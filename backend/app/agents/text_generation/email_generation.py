# This will be used to generate emails based on the summarized text# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini


def generate_email(summary: str):
    prompt = f"""
 Write a clear, professional email based on the text below.

Requirements:

    Tone: friendly yet professional
    
Output:

    Only the content of the email

Text:
  {summary}
  """
    return query_gemini(prompt)
