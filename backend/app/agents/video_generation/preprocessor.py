"""
Video generation preprocessing pipeline.

Sits between user inputs and the Veo 3.1 API call. Uses Gemini 2.5 Flash
for image analysis, image selection (when >3), and prompt enhancement.

Veo 3.1 constraints handled here:
  - Max 3 reference images
  - Only 16:9 or 9:16 aspect ratios
  - Durations of 4/6/8 seconds
  - Raw multi-modal context needs distilling into a focused prompt
"""

from __future__ import annotations

import base64
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Image selection
# ---------------------------------------------------------------------------

def select_best_images(
    image_bytes_list: list[bytes],
    scores: list[float] | None = None,
    text_context: str = "",
    user_prompt: str = "",
    max_count: int = 3,
) -> list[bytes]:
    """
    Pick the best reference images for Veo (max 3).

    Priority:
      1. If upstream scores exist (e.g. from ImageMatching), sort descending.
      2. If >max_count and no scores, use Gemini to rank relevance.
      3. If <=max_count, pass all through.
    """
    if len(image_bytes_list) <= max_count:
        return image_bytes_list

    # If we have scores from ImageMatching, use them
    if scores and len(scores) == len(image_bytes_list):
        paired = sorted(
            zip(scores, image_bytes_list), key=lambda x: x[0], reverse=True
        )
        return [img for _, img in paired[:max_count]]

    # Use Gemini to score relevance
    try:
        return _select_images_with_gemini(
            image_bytes_list, text_context, user_prompt, max_count
        )
    except Exception as e:
        logger.warning("Gemini image selection failed, taking first %d: %s", max_count, e)
        return image_bytes_list[:max_count]


def _select_images_with_gemini(
    image_bytes_list: list[bytes],
    text_context: str,
    user_prompt: str,
    max_count: int,
) -> list[bytes]:
    """Use Gemini 2.5 Flash to pick the most relevant images."""
    from google.genai import types
    from app.llm.gemini import run_with_gemini_client

    context = user_prompt or text_context or "a visually compelling short video"

    parts: list[Any] = [
        types.Part.from_text(
            f"I'm creating a video about: {context}\n\n"
            f"Below are {len(image_bytes_list)} candidate reference images. "
            f"Return ONLY a comma-separated list of the {max_count} best image "
            f"indices (0-based) for this video, ordered by relevance. "
            f"Example: 0,3,1"
        ),
    ]

    for i, img_bytes in enumerate(image_bytes_list):
        parts.append(types.Part.from_text(f"Image {i}:"))
        parts.append(
            types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
        )

    response = run_with_gemini_client(
        model="gemini-2.5-flash",
        operation_name="video_preprocessor_select_images",
        request_fn=lambda client: client.models.generate_content(
            model="gemini-2.5-flash",
            contents=parts,
        ),
    )

    # Parse the comma-separated indices
    text = response.text.strip()
    indices: list[int] = []
    for token in text.replace(" ", "").split(","):
        try:
            idx = int(token)
            if 0 <= idx < len(image_bytes_list) and idx not in indices:
                indices.append(idx)
        except ValueError:
            continue

    if not indices:
        return image_bytes_list[:max_count]

    return [image_bytes_list[i] for i in indices[:max_count]]


# ---------------------------------------------------------------------------
# 2. Image analysis
# ---------------------------------------------------------------------------

def analyze_images(
    image_bytes_list: list[bytes],
) -> list[str]:
    """
    Send each image to Gemini 2.5 Flash and get a detailed description.

    Returns a list of description strings, one per image.
    """
    if not image_bytes_list:
        return []

    from google.genai import types
    from app.llm.gemini import run_with_gemini_client
    descriptions: list[str] = []

    for i, img_bytes in enumerate(image_bytes_list):
        try:
            response = run_with_gemini_client(
                model="gemini-2.5-flash",
                operation_name="video_preprocessor_analyze_image",
                request_fn=lambda client: client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        types.Part.from_text(
                        "Describe this image in detail — subject, composition, "
                        "colors, mood, and setting. Be concise (2-3 sentences)."
                    ),
                        types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    ],
                ),
            )
            descriptions.append(response.text.strip())
        except Exception as e:
            logger.warning("Failed to analyze image %d: %s", i, e)
            descriptions.append(f"[Image {i}: analysis unavailable]")

    return descriptions


# ---------------------------------------------------------------------------
# 3. Prompt enhancement
# ---------------------------------------------------------------------------

# Regex to detect likely personal names: two or more consecutive capitalised words
_NAME_PATTERN = re.compile(
    r"\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b"
)


def _strip_names(text: str) -> str:
    """Replace anything that looks like a personal name with 'a person'."""
    return _NAME_PATTERN.sub("a person", text)


_ENHANCE_SYSTEM_PROMPT = (
    "You are a video generation prompt engineer. Given the user's intent, "
    "any text context, and descriptions of reference images, create a detailed, "
    "cinematic prompt for Veo 3.1 video generation.\n\n"
    "CRITICAL RULES:\n"
    "- NEVER include real names, user names, or personal names. Replace any "
    "names with generic descriptors (e.g. 'a traveler', 'a chef', 'a person').\n"
    "- Keep the prompt under 200 words. Be concise and direct.\n"
    "- Describe camera movement, lighting, pacing, and how to incorporate "
    "reference images.\n"
    "- Use simple, clear language. Avoid ambiguous terms that could be "
    "misinterpreted by safety filters.\n"
    "- Output ONLY the enhanced prompt, nothing else."
)

# Style directives injected into the prompt enhancement context
VIDEO_STYLE_DIRECTIVES: dict[str, str] = {
    "marketing": (
        "Style: Marketing / promotional video. Use dynamic transitions, "
        "bold visually-driven storytelling, upbeat energy, and polished "
        "product-focused framing. Emphasize brand appeal and call-to-action energy."
    ),
    "slideshow": (
        "Style: Slideshow / montage. Smooth Ken Burns pans and crossfade "
        "transitions between images. Gentle, steady pacing with each image "
        "lingering for visual impact. Clean, minimal motion."
    ),
    "product_demo": (
        "Style: Product demonstration. Clean, well-lit studio-style framing. "
        "Slow, deliberate camera movements showcasing the product from multiple "
        "angles. Professional, informative tone with clear visual hierarchy."
    ),
    "cinematic": (
        "Style: Cinematic. Wide establishing shots, shallow depth of field, "
        "dramatic lighting with golden hour / blue hour tones. Slow, sweeping "
        "camera movements. Film-grain aesthetic, 24fps feel, letterbox framing."
    ),
    "documentary": (
        "Style: Documentary. Naturalistic handheld camera feel, observational "
        "framing. Mix of wide contextual shots and intimate close-ups. "
        "Authentic, unpolished aesthetic with emphasis on storytelling and emotion."
    ),
}


def enhance_prompt(
    user_prompt: str,
    text_context: str = "",
    image_descriptions: list[str] | None = None,
    video_style: str = "",
) -> str:
    """
    Use Gemini to create an optimized Veo prompt from all available context.

    Falls back to a simple combined prompt on failure.
    """
    # Build context message
    parts: list[str] = [_ENHANCE_SYSTEM_PROMPT, ""]

    # Inject style directive if selected (preset or custom text)
    style_directive = VIDEO_STYLE_DIRECTIVES.get(video_style, "")
    if not style_directive and video_style:
        # Treat as custom user-provided style directive
        style_directive = f"Style: {video_style}"
    if style_directive:
        parts.append(style_directive)

    if user_prompt:
        parts.append(f"User's intent: {user_prompt}")
    if text_context:
        parts.append(f"Text context: {text_context[:2000]}")
    if image_descriptions:
        parts.append("Reference image descriptions:")
        for i, desc in enumerate(image_descriptions):
            parts.append(f"  Image {i + 1}: {desc}")

    if not user_prompt and not text_context and not image_descriptions:
        if style_directive:
            # Style selected but no other context — generate a style-specific default
            return f"Create a visually compelling short video. {style_directive}"
        return "Create a visually compelling short video with smooth motion and cinematic lighting."

    combined = "\n".join(parts)

    try:
        from app.llm.gemini import run_with_gemini_client

        response = run_with_gemini_client(
            model="gemini-2.5-flash",
            operation_name="video_preprocessor_enhance_prompt",
            request_fn=lambda client: client.models.generate_content(
                model="gemini-2.5-flash",
                contents=combined,
            ),
        )
        enhanced = response.text.strip()
        if enhanced:
            # Safety net: strip any names Gemini may have kept
            return _strip_names(enhanced)
    except Exception as e:
        logger.warning("Prompt enhancement failed, using simple prompt: %s", e)

    # Fallback: simple concatenation (strip names from raw inputs)
    fallback_parts: list[str] = []
    if style_directive:
        fallback_parts.append(style_directive)
    if user_prompt:
        fallback_parts.append(_strip_names(user_prompt))
    if text_context:
        fallback_parts.append(f"Context:\n{_strip_names(text_context)}")
    return "\n\n".join(fallback_parts) if fallback_parts else "Create a visually compelling short video."


# ---------------------------------------------------------------------------
# 4. Orchestrator
# ---------------------------------------------------------------------------

def preprocess_video_inputs(
    params: dict[str, Any],
    inputs: dict[str, Any],
) -> tuple[str, list[bytes], dict[str, Any]]:
    """
    Main preprocessing orchestrator.

    Args:
        params: Node params (user_prompt, negative_prompt, etc.)
        inputs: Resolved inputs from upstream connections (images, text, videos)

    Returns:
        (enhanced_prompt, selected_image_bytes, preprocessing_metadata)
    """
    user_prompt = params.get("user_prompt", "")
    video_style = params.get("video_style", "")

    # Collect text context
    text_input = inputs.get("text", "")
    if isinstance(text_input, list):
        text_input = "\n\n".join(str(t) for t in text_input if t)

    # Collect image bytes (already fetched by the executor)
    image_bytes_list: list[bytes] = inputs.get("_image_bytes", [])

    # Collect any scores from ImageMatching
    scores: list[float] | None = inputs.get("_image_scores", None)

    # Note: videos are accepted as input but not currently used by Veo
    # They're tracked in metadata for future use

    metadata: dict[str, Any] = {
        "original_image_count": len(image_bytes_list),
        "text_context_length": len(text_input),
        "user_prompt": user_prompt,
        "video_style": video_style,
        "had_scores": scores is not None,
    }

    # Step 1: Select best images (max 3 for Veo)
    selected_images = select_best_images(
        image_bytes_list,
        scores=scores,
        text_context=text_input,
        user_prompt=user_prompt,
    )
    metadata["selected_image_count"] = len(selected_images)

    # Step 2: Analyze selected images
    image_descriptions: list[str] = []
    if selected_images:
        image_descriptions = analyze_images(selected_images)
        metadata["image_descriptions"] = image_descriptions

    # Step 3: Enhance prompt
    enhanced_prompt = enhance_prompt(
        user_prompt=user_prompt,
        text_context=text_input,
        image_descriptions=image_descriptions if image_descriptions else None,
        video_style=video_style,
    )
    metadata["enhanced_prompt"] = enhanced_prompt

    return enhanced_prompt, selected_images, metadata
