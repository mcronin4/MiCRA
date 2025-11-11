# Summarizes the text / transcript to a dense summary.
# Some important factors to consider:
# - The summary should be concise and information dense, but we don't want to lose any important information. We want to investigate Chain-of-Density prompting for this.
# - The actual output here should be an object including some fields such as: claims, entities, key points, dates, metrics, topics, etc.
# - Essentially, we should have the dense summary but also include key information to ensure they don't miss any important information.
# - Ideally, we want to keep timestamp-citations for each line of the dense summary. It should cite a timestamp range for each line of the dense summary.
from ...llm.gemini import query_gemini

# simple JSON schema for structured output
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "dense_summary": {"type": "string"},
        "claims": {"type": "array", "items": {"type": "string"}},
        "entities": {"type": "array", "items": {"type": "string"}},
        "dates": {"type": "array", "items": {"type": "string"}},
        "metrics": {"type": "array", "items": {"type": "string"}},
        "topics": {"type": "array", "items": {"type": "string"}}
    },
    "required": ["dense_summary"]
}

prompt = """You are a precise summarization model.
Convert the following text into a concise, information-dense summary.
Return the result as a JSON object with the fields:
- dense_summary: a short paragraph capturing all key ideas
- claims: key factual statements
- entities: names of people, organizations, or products
- dates: any explicit time references
- metrics: numbers, percentages, or quantitative measures
- topics: main themes or concepts

Text:
{text}
"""

def summarize(text):
    response = query_gemini(
        prompt.format(text=text),
        response_schema=SUMMARY_SCHEMA,
        response_mime_type="application/json",
    )
    return response


