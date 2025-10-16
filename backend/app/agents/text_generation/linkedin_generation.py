# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini


def generate_linkedin_post(summary: str):
    prompt = f"""
Generate a LinkedIn post using the text below.

Requirements:

    Length: maximum 2,900 characters (leave buffer under 3,000)

Output:

    Only the post content

Text:
  {summary}
  """
    return query_gemini(prompt)
