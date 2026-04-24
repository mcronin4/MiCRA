# Agent — Text Generation

## Purpose
This agent owns all platform-specific text content generation: LinkedIn posts,
emails, TikTok scripts, and chatbot responses. It does NOT store generated
content, schedule posts, or ingest source material. Two parallel architectures
coexist here — callers must know which one they are on.

## Architecture
Two generation paths exist side by side:

**Preset path** (`generator.py`): Fetches prompt templates and output schemas
from the Supabase `text_generation_presets` table, calls Gemini with optional
structured output. Returns a structured dict. Used by `api/v1/text_generation.py`
and by `services/workflow_executor.py` (as the `TextGeneration` node executor).

**Standalone path** (four separate files): `email_generation.py`,
`linkedin_generation.py`, `tiktok_generation.py`, `chatbot_generation.py` — each
has hardcoded prompts and returns a raw string. Used by the legacy `api/v1/hitl.py`
route and `api/v1/trigger_job.py`.

`content_parser.py` provides post-processing parsers for email, LinkedIn, and
TikTok. These have no internal callers — they are utilities for external callers
to invoke after receiving raw output from the standalone generators.

## Contracts
- `generate_text(input_text, preset_id, ...) -> Dict[str, Any]` — preset path.
  Returns a structured dict if the preset has an `output_format` schema, or
  `{"content": str}` for freeform output.
- All standalone generators accept `source_texts: Optional[List[Dict]]` where
  each dict must have `'title'` and `'content'` keys. Passing dicts without
  these keys will produce incorrect source context silently.
- Template placeholder priority in `generator.py`: `{source_context}` is
  substituted first, then `{input_text}`, then the context is prepended if
  neither placeholder exists. This order is not type-enforced.
- `text_generation_presets` table columns read: `prompt`, `output_format`,
  `tone_guidance`, `max_length`, `structure_template`. `output_format` must be
  a JSON schema dict or JSONB — plain strings will cause parsing errors.

## Pitfalls
- `content_parser.py` functions (`parse_email_content`, `parse_linkedin_content`,
  `parse_tiktok_content`) have no internal callers. They are orphaned utilities.
  Callers that want structured output from the standalone path must invoke these
  manually.
- `parse_tiktok_content` hardcodes `username: '@micra_official'` and
  `music: 'Original Sound - MiCRA'`. These are placeholder values. Callers
  treating them as live data will produce incorrect output.
- `generator.py` applies a regex guard that strips trailing "Visual Suggestions"
  and "Image Ideas" sections from freeform Gemini output. Structured output
  (via `output_format` schema) bypasses this guard entirely.
- The standalone generators duplicate the `build_source_context` helper logic
  internally — there is no shared helper. If you fix a bug in source context
  building in one file, you must fix it in all four standalone generators.
- The preset path requires a live Supabase connection at call time. Tests that
  call `generate_text` without mocking the Supabase client will hit the real
  database.
