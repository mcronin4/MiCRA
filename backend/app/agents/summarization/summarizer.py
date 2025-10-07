# Summarizes the text / transcript to a dense summary.
# Some important factors to consider:
# - The summary should be concise and information dense, but we don't want to lose any important information. We want to investigate Chain-of-Density prompting for this.
# - The actual output here should be an object including some fields such as: claims, entities, key points, dates, metrics, topics, etc.
# - Essentially, we should have the dense summary but also include key information to ensure they don't miss any important information.
# - Ideally, we want to keep timestamp-citations for each line of the dense summary. It should cite a timestamp range for each line of the dense summary.
from ...llm.gemini import query_gemini

prompt="""Convert the following text into a concise and information-dense summary, ensuring that all key points, 
claims, entities, dates, metrics, and topics are captured. \n\nText:\n{text}\n\nSummary:"""

def summarize(text):
    summary = query_gemini(prompt.format(text=text))
    return summary

