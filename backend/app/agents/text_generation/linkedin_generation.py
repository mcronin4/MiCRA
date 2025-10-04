# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini


def generate_linkedin_post(summary: str):
    prompt = f"""
  Generate a LinkedIn post based on the following summary, the tone should be professional and catchy. Word limit is 150 words:
  {summary}
  """
    return query_gemini(prompt)


example_summary = """
  Event Summary – Global AI Horizons Conference 2025

The Global AI Horizons Conference 2025 brought together over 2,000 researchers, engineers, policymakers, and entrepreneurs from 45 countries to discuss the future of artificial intelligence. Held in Toronto, Canada, the three-day event featured keynote speeches from leaders at OpenAI, DeepMind, and Stanford University, alongside workshops and startup showcases.

Highlights included:

Keynote on Responsible AI: Dr. Amina Patel (Stanford) emphasized the need for transparent AI governance and showcased a new framework for auditing large-scale models.

Generative AI Showcase: Multiple startups demonstrated breakthroughs in video synthesis, music composition, and AI-driven design tools.

AI in Healthcare Panel: Representatives from the Mayo Clinic and IBM Watson discussed real-world deployments of AI in diagnostics, with both optimism and caution about ethical data use.

Student Hackathon: Over 150 students built prototypes in 24 hours, with the winning team creating an AI assistant that summarizes medical research papers into plain language.

The conference concluded with a forward-looking discussion on AI and Climate Change, highlighting applications in energy optimization and predictive modeling for natural disasters.

Attendees left with new collaborations, ideas, and a stronger commitment to building trustworthy, impactful AI systems.
"""

print(generate_linkedin_post(example_summary))
