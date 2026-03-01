"""
Quote extraction agent using Gemini structured output.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from ...llm.gemini import query_gemini


SYSTEM_PROMPT = """
You are an expert editorial quote extractor.
Your job is to select the best quotes from a transcript.

Rules:
- Quotes must be verbatim and directly copyable from the transcript.
- Do not paraphrase or invent content.
- Remove speaker labels and timestamps like [00:12] or 00:12-00:15.
- Prefer complete, standalone thoughts.
- Avoid duplicates or near duplicates.
- If the transcript is short, return fewer quotes rather than fabricating.
- Do not include any analysis, reasoning, or commentary.
- Do not use <think> or similar tags.

Style guidance:
- general: balanced and broadly useful pull quotes (target 6-30 words).
- punchy: short, memorable, high-impact phrasing (target 5-18 words).
- insightful: reveals a key idea, lesson, or takeaway (target 8-35 words).
- contrarian: challenges conventional wisdom or offers a surprising take (target 6-30 words).
- emotional: conveys strong feeling, vulnerability, or personal stakes (target 6-28 words).

Output:
Return ONLY valid JSON in this exact shape:
{"quotes": [{"text": "..."}]}
"""


STYLE_OPTIONS = {"general", "punchy", "insightful", "contrarian", "emotional"}


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return cleaned


def _extract_json(text: str) -> Optional[Any]:
    cleaned = _strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None

    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None

    return None


def _sanitize_quote(text: str) -> str:
    cleaned = text.strip()
    cleaned = cleaned.strip("\"'")
    cleaned = re.sub(r"^\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]\s*", "", cleaned)
    cleaned = re.sub(r"^\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s*-?\s*", "", cleaned)
    cleaned = re.sub(r"^[A-Za-z][A-Za-z0-9 _\-]{0,25}:\s+", "", cleaned)
    cleaned = re.sub(r"\b\d{1,2}:\d{2}(?::\d{2})?\b", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _dedupe_quotes(quotes: List[Dict[str, str]]) -> List[Dict[str, str]]:
    seen = set()
    unique: List[Dict[str, str]] = []
    for quote in quotes:
        text = quote.get("text", "").strip()
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        unique.append(quote)
    return unique


def _parse_quotes(raw_text: str) -> List[Dict[str, str]]:
    data = _extract_json(raw_text)
    quotes: List[Dict[str, str]] = []

    if isinstance(data, dict):
        items = data.get("quotes", [])
    elif isinstance(data, list):
        items = data
    else:
        items = []

    if items:
        for item in items:
            if isinstance(item, dict):
                text = item.get("text") or item.get("quote") or ""
                reason = item.get("reason") or item.get("why")
            elif isinstance(item, str):
                text = item
                reason = None
            else:
                continue

            cleaned = _sanitize_quote(text)
            if cleaned:
                entry: Dict[str, str] = {"text": cleaned}
                if reason and isinstance(reason, str):
                    entry["reason"] = reason.strip()
                quotes.append(entry)

    if not quotes:
        for line in raw_text.splitlines():
            candidate = line.strip().lstrip("-*0123456789. ").strip()
            if not candidate:
                continue
            cleaned = _sanitize_quote(candidate)
            if cleaned:
                quotes.append({"text": cleaned})

    return _dedupe_quotes(quotes)


def _normalize_for_match(text: str) -> str:
    lowered = text.lower()
    lowered = re.sub(r"[\r\n\t]+", " ", lowered)
    lowered = re.sub(r"[^\w\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def _quote_in_transcript(quote: str, transcript: str) -> bool:
    normalized_quote = _normalize_for_match(quote)
    normalized_transcript = _normalize_for_match(transcript)
    if not normalized_quote or not normalized_transcript:
        return False
    return normalized_quote in normalized_transcript


def _filter_quotes_from_transcript(
    quotes: List[Dict[str, str]],
    transcript: str,
) -> List[Dict[str, str]]:
    filtered: List[Dict[str, str]] = []
    for quote in quotes:
        text = quote.get("text", "")
        if text and _quote_in_transcript(text, transcript):
            filtered.append(quote)
    return _dedupe_quotes(filtered)


def _split_sentences(transcript: str) -> List[str]:
    cleaned = re.sub(r"\s+", " ", transcript).strip()
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    sentences = [part.strip() for part in parts if part.strip()]
    if len(sentences) <= 1:
        words = cleaned.split()
        chunk_size = 20
        sentences = [
            " ".join(words[i : i + chunk_size])
            for i in range(0, len(words), chunk_size)
        ]
    return sentences


def _style_length_bounds(style: str) -> Tuple[int, int]:
    if style == "general":
        return (6, 30)
    if style == "punchy":
        return (5, 18)
    if style == "insightful":
        return (8, 35)
    if style == "contrarian":
        return (6, 30)
    if style == "emotional":
        return (6, 28)
    return (6, 28)


def _ensure_sentence_case(text: str) -> str:
    if not text:
        return text
    chars = list(text)
    for idx, ch in enumerate(chars):
        if ch.isalpha():
            chars[idx] = ch.upper()
            break
    return "".join(chars)


def _ensure_terminal_punctuation(text: str) -> str:
    if not text:
        return text
    if text.endswith((".", "!", "?")):
        return text
    return f"{text}."


def _format_quote_text(text: str) -> str:
    cleaned = _sanitize_quote(text)
    cleaned = re.sub(r"\s+([,.!?])", r"\1", cleaned)
    cleaned = _ensure_sentence_case(cleaned)
    cleaned = _ensure_terminal_punctuation(cleaned)
    return cleaned.strip()


def _filter_by_length(
    quotes: List[Dict[str, str]],
    min_words: int,
    max_words: int,
) -> List[Dict[str, str]]:
    filtered: List[Dict[str, str]] = []
    for quote in quotes:
        text = quote.get("text", "")
        word_count = len(re.findall(r"\b\w+\b", text))
        if min_words <= word_count <= max_words:
            filtered.append(quote)
    return _dedupe_quotes(filtered)


def _fallback_extract(
    transcript: str,
    style: str,
    count: int,
) -> List[Dict[str, str]]:
    sentences = _split_sentences(transcript)
    min_words, max_words = _style_length_bounds(style)
    candidates: List[Dict[str, str]] = []

    for sentence in sentences:
        cleaned = _sanitize_quote(sentence)
        if not cleaned:
            continue
        word_count = len(cleaned.split())
        if min_words <= word_count <= max_words and _quote_in_transcript(
            cleaned, transcript
        ):
            candidates.append({"text": cleaned})

    if len(candidates) < count:
        for sentence in sentences:
            cleaned = _sanitize_quote(sentence)
            if not cleaned:
                continue
            if _quote_in_transcript(cleaned, transcript):
                candidates.append({"text": cleaned})

    return _dedupe_quotes(candidates)[:count]


async def extract_quotes(
    transcript: str,
    style: str,
    count: int,
) -> List[Dict[str, str]]:
    if not transcript or not transcript.strip():
        raise ValueError("Transcript cannot be empty")

    normalized_style = style.strip().lower() if style else "general"
    if normalized_style not in STYLE_OPTIONS:
        normalized_style = "general"

    count = max(1, min(count, 30))

    user_prompt = (
        f"Style: {normalized_style}\n"
        f"Number of quotes: {count}\n\n"
        "Transcript:\n"
        f"{transcript.strip()}\n\n"
        "Output JSON only. No analysis. No timestamps. Quotes must be verbatim."
    )

    response_schema = {
        "type": "object",
        "properties": {
            "quotes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["quotes"],
        "additionalProperties": False,
    }

    try:
        result = query_gemini(
            f"{SYSTEM_PROMPT}\n\n{user_prompt}",
            response_schema=response_schema,
            response_mime_type="application/json",
        )
    except Exception:
        result = None

    if result is None:
        return _fallback_extract(transcript, normalized_style, count)

    if isinstance(result, dict):
        quotes = _parse_quotes(json.dumps(result))
    else:
        quotes = _parse_quotes(str(result))

    formatted_quotes: List[Dict[str, str]] = []
    for quote in quotes:
        text = quote.get("text", "")
        formatted = _format_quote_text(text)
        if formatted:
            formatted_quotes.append({"text": formatted})
    quotes = formatted_quotes

    quotes = _filter_quotes_from_transcript(quotes, transcript)
    min_words, max_words = _style_length_bounds(normalized_style)
    quotes = _filter_by_length(quotes, min_words, max_words)

    if len(quotes) < count:
        fallback_quotes = _fallback_extract(transcript, normalized_style, count)
        for quote in fallback_quotes:
            if len(quotes) >= count:
                break
            if quote not in quotes:
                quotes.append(quote)

    return quotes[:count]
