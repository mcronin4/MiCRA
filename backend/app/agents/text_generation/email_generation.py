# This will be used to generate emails based on the summarized text


def generate_email(summary: str):
    prompt = f"""
  Write a clear, professional email based on the following event summary. Keep the tone friendly yet professional, avoid jargon, and keep the length under 250 words.
  {summary}
  """
    return query_gemini(prompt)
