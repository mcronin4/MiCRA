from __future__ import annotations

import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.agents.text_generation.generator import (
    _append_freeform_output_guardrails,
    _sanitize_freeform_text_output,
)


def test_freeform_output_guardrails_block_visual_suggestions_and_extra_sections() -> None:
    prompt = _append_freeform_output_guardrails("Write a LinkedIn post about this demo.")

    assert "Return only the requested final content body." in prompt
    assert "Do not include titles, headings, labels, section dividers, preambles, notes, or explanations." in prompt
    assert "Do not add visual suggestions, image ideas, image prompts, or any separate recommendations unless explicitly requested." in prompt


def test_sanitize_freeform_text_output_removes_visual_suggestions_section() -> None:
    raw = (
        "This is the LinkedIn post body.\n"
        "#Productivity #AI\n\n"
        "---\n\n"
        "VISUAL SUGGESTIONS:\n"
        "- A dashboard shot\n"
        "- A founder team photo\n"
    )

    cleaned = _sanitize_freeform_text_output(raw)

    assert cleaned == "This is the LinkedIn post body.\n#Productivity #AI"
