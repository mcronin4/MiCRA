# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini


def generate_linkedin_post(summary: str):
    prompt = f"""
  Generate a LinkedIn post based on the following summary, the tone should be professional and catchy. Word limit is 150 words:
  {summary}
  """
    return query_gemini(prompt)
