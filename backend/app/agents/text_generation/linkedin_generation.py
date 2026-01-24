# This will be used to generate LinkedIn posts based on the summarized text
from ...llm.gemini import query_gemini
from typing import Optional


def generate_linkedin_post(
    source_texts: Optional[list[dict]] = None,
    tone_preference: Optional[str] = None
):
    # Build source context section
    source_context = ""
    if source_texts and len(source_texts) > 0:
        source_context = "\n\nSOURCE CONTEXT (use as primary reference):\n"
        for idx, source in enumerate(source_texts, 1):
            title = source.get('title', f'Source {idx}')
            content = source.get('content', '')
            source_context += f"\n--- {title} ---\n{content}\n"
        source_context += "\nImportant: Use the source context as your primary reference. Extract key points, insights, and details from it. Do NOT fabricate information not present in the source. Maintain consistency with source facts."
    
    # Build tone section
    tone_guidance = "Write in a professional yet conversational tone"
    if tone_preference:
        tone_guidance = f"Tone/Style to use: {tone_preference}"
    
    prompt = f"""
You are writing a LinkedIn post that may be published by either an individual or a brand/organization. The voice should be professional, human, and credible/informative rather than promotional.

CONTENT (primary reference):
{source_context if source_context else "No source context provided."}

STRICT REQUIREMENTS:
- Maximum length: 1,200 characters (strict). Aim for 900–1,050 characters.
- 3–5 short paragraphs total
- Each paragraph: 1–2 sentences

RULES (CRITICAL):
- Every claim must be grounded in the source context.
- Include 2–4 concrete details from the source when available (e.g., numbers, names, dates, specific outcomes, steps, tools).
- If the source lacks concrete details, do NOT invent them. Write more cautiously and keep the post shorter.
- Remove any sentence that could apply to many unrelated topics.

LIMIT OVERUSED PHRASES (try not to use):
game-changer, in today’s world, let’s unpack, excited to share, thrilled to announce, delighted to share,
thought leadership, synergy, unlock, leverage, innovative solution, meaningful impact, next level,
disrupt, at scale, deep dive, passion, journey, humbled, grateful, honored

STRUCTURE:
1. Hook (1 sentence): Start with either a clear question OR a specific, defensible claim.
2. Core value (2-3 sentences): Present ONE key insight using this pattern:
   Point → Evidence from source → Actionable takeaway.
3) Context (optional, 1–2 sentences): Brief clarification, implication, or example tied directly to the source (no new facts).
4. Call-to-action (1 sentence): End with a thoughtful question that invites discussion (not “thoughts?”). Or a clear next step.

STYLE:
- {tone_guidance}
- Clear, direct, and neutral in tone
- Human and natural, not corporate or salesy or AI-sounding
- Use conversational language, avoid corporate jargon
- Be specific and concrete, not vague or generic
- NO asterisks (***), NO dashes for emphasis, NO overused phrases, no bullet points 
- Hashtags: either none OR exactly 2 relevant ones

Output ONLY the post content. No preamble, no explanations.
"""
    return query_gemini(prompt)
