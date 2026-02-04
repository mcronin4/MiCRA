"""
Workflow execution engine.

Takes a compiled Blueprint, walks the toposorted execution order,
resolves inputs from upstream outputs via connections, dispatches
to the appropriate agent function, and returns all results.

Key concepts:
- Bucket nodes (ImageBucket, AudioBucket, VideoBucket, TextBucket) are source nodes
  that pull files from R2 storage using selected_file_ids from their params.
- Shape conversion (list <-> single) happens automatically based on port specs.
- Parallel execution: nodes with no unsatisfied dependencies execute concurrently.
- Results are logged to the executions table for debugging and history.

V2: Parallel execution with dynamic ready-queue, error stops execution.
"""

from __future__ import annotations

import asyncio
import time
import logging
from typing import Any, Callable, Literal

from pydantic import BaseModel

from app.models.blueprint import Blueprint, BlueprintConnection
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result models
# ---------------------------------------------------------------------------


class NodeExecutionResult(BaseModel):
    node_id: str
    status: Literal["completed", "error"]
    outputs: dict[str, Any] | None = None
    error: str | None = None
    execution_time_ms: int = 0


class WorkflowExecutionResult(BaseModel):
    success: bool
    workflow_outputs: dict[str, Any]
    node_results: list[NodeExecutionResult]
    total_execution_time_ms: int
    error: str | None = None


# ---------------------------------------------------------------------------
# Executor registry
# ---------------------------------------------------------------------------

# Maps node type names to their async executor functions.
# Each executor receives (params, inputs) and returns outputs dict.
# Params come from the node's configuration (e.g., preset_id, selected_file_ids).
# Inputs come from upstream nodes via connections, after shape conversion.
_registry: dict[str, Callable] = {}


def executor(node_type: str):
    """
    Decorator that registers an async executor function for a node type.

    Usage:
        @executor("MyNodeType")
        async def _exec_my_node(params: dict, inputs: dict) -> dict[str, Any]:
            # Process inputs using params configuration
            return {"output_key": result}
    """
    def decorator(fn: Callable):
        _registry[node_type] = fn
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Input resolution
# ---------------------------------------------------------------------------


def _convert_shape(
    value: Any,
    source_shape: str,
    target_shape: str,
    runtime_type: str,
    input_key: str,
) -> Any:
    """
    Convert a value between shapes (single/list) according to conversion rules.
    
    Conversion rules:
    - list → single: 
      * For Text: join with "\n\n"
      * For other types: take first item (or raise if empty)
    - single → list: wrap in list
    - same shape: pass through
    
    Args:
        value: The value to convert
        source_shape: "single" or "list" of the source port
        target_shape: "single" or "list" of the target port
        runtime_type: The runtime type (Text, ImageRef, etc.)
        input_key: The input key name (for error messages)
    
    Returns:
        Converted value matching target_shape
    """
    # Same shape - no conversion needed
    if source_shape == target_shape:
        return value
    
    # list → single conversion
    if source_shape == "list" and target_shape == "single":
        if not isinstance(value, list):
            raise ValueError(
                f"Expected list for {input_key} but got {type(value).__name__}"
            )
        
        if len(value) == 0:
            # Empty list - return empty string for Text, None for others
            if runtime_type == "Text":
                return ""
            raise ValueError(
                f"Empty list provided for {input_key} which requires a single {runtime_type}"
            )
        
        if runtime_type == "Text":
            # Join text items with double newline
            return "\n\n".join(str(item) for item in value if item)
        else:
            # For other types, take first item
            if len(value) > 1:
                logger.warning(
                    f"List with {len(value)} items provided for {input_key} "
                    f"which expects single {runtime_type}. Using first item."
                )
            return value[0]
    
    # single → list conversion
    if source_shape == "single" and target_shape == "list":
        if value is None:
            return []
        # Wrap single value in list
        return [value]
    
    # Should not reach here
    raise ValueError(
        f"Unsupported shape conversion: {source_shape} → {target_shape}"
    )


def _build_dependency_graph(
    blueprint: Blueprint,
) -> tuple[dict[str, int], dict[str, list[str]], dict[str, set[str]]]:
    """
    Build dependency tracking structures from blueprint connections.

    Returns:
        in_degree: count of unsatisfied dependencies for each node
        adjacency: node -> list of downstream nodes to unblock
        reverse_adj: node -> set of upstream dependencies (for deduplication)
    """
    # Initialize all nodes with zero in-degree
    in_degree: dict[str, int] = {n.node_id: 0 for n in blueprint.nodes}
    adjacency: dict[str, list[str]] = {n.node_id: [] for n in blueprint.nodes}
    reverse_adj: dict[str, set[str]] = {n.node_id: set() for n in blueprint.nodes}

    # Process connections - multiple connections between same nodes count as one dependency
    for conn in blueprint.connections:
        from_node = conn.from_node
        to_node = conn.to_node

        # Only count each upstream dependency once (handles multiple ports between same nodes)
        if from_node not in reverse_adj[to_node]:
            reverse_adj[to_node].add(from_node)
            in_degree[to_node] += 1
            adjacency[from_node].append(to_node)

    return in_degree, adjacency, reverse_adj


def resolve_node_inputs(
    node_id: str,
    node_type: str,
    connections: list[BlueprintConnection],
    node_outputs: dict[str, dict[str, Any]],
    blueprint: Blueprint | None = None,
) -> dict[str, Any]:
    """
    Resolve inputs for a node from upstream outputs via connections.
    
    Performs automatic shape conversion (list ↔ single) according to conversion rules.
    
    Conversion rules:
    - list → single: 
      * For Text: join with "\n\n"
      * For other types: take first item (warns if multiple items)
    - single → list: wrap in list
    - same shape: pass through
    """
    from app.models.node_registry import get_node_spec
    
    # Bucket nodes have no inputs (they're sources)
    if node_type in ("ImageBucket", "AudioBucket", "VideoBucket", "TextBucket"):
        return {}

    # Get target node spec for shape information
    target_spec = get_node_spec(node_type)
    if not target_spec:
        logger.warning(f"No spec found for node type {node_type}, skipping shape conversion")

    resolved: dict[str, Any] = {}
    for conn in connections:
        if conn.to_node == node_id:
            upstream = node_outputs.get(conn.from_node)
            if upstream is None:
                raise ValueError(
                    f"Missing outputs from upstream node {conn.from_node}"
                )
            if conn.from_output not in upstream:
                raise ValueError(
                    f"Upstream node {conn.from_node} missing output key "
                    f"'{conn.from_output}'"
                )
            
            raw_value = upstream[conn.from_output]
            
            # Get source and target port specs for shape conversion
            # If blueprint is None, we can still do shape conversion using target_spec and value inference
            if target_spec:
                # Find target port spec
                target_port = next(
                    (p for p in target_spec.inputs if p.key == conn.to_input),
                    None
                )
                
                if target_port:
                    source_shape = None
                    source_port = None
                    
                    # Try to get source port spec from blueprint if available
                    if blueprint:
                        source_node = next(
                            (n for n in blueprint.nodes if n.node_id == conn.from_node),
                            None
                        )
                        if source_node:
                            source_spec = get_node_spec(source_node.type)
                            if source_spec:
                                source_port = next(
                                    (p for p in source_spec.outputs if p.key == conn.from_output),
                                    None
                                )
                                if source_port:
                                    source_shape = source_port.shape
                    
                    # If we couldn't get source shape from blueprint, infer from value type
                    if source_shape is None:
                        source_shape = "list" if isinstance(raw_value, list) else "single"
                    
                    target_shape = target_port.shape
                    runtime_type = target_port.runtime_type
                    
                    # Convert shape if needed
                    if source_shape != target_shape:
                        logger.debug(
                            f"Converting {conn.to_input} from {source_shape} to {target_shape} "
                            f"(type: {runtime_type}, node: {node_id})"
                        )
                        raw_value = _convert_shape(
                            raw_value,
                            source_shape,
                            target_shape,
                            runtime_type,
                            conn.to_input,
                        )
            
            resolved[conn.to_input] = raw_value

    return resolved


# ---------------------------------------------------------------------------
# Node executors
# ---------------------------------------------------------------------------


@executor("ImageBucket")
async def _exec_image_bucket(params: dict, inputs: dict) -> dict[str, Any]:
    """Fetch selected images from storage and return as ImageRef list."""
    from app.db.supabase import get_supabase
    from app.storage.r2 import get_r2, R2_BUCKET
    
    selected_file_ids = params.get("selected_file_ids", [])
    if not selected_file_ids:
        return {"images": []}
    
    supabase = get_supabase().client
    r2 = get_r2()
    
    # Fetch file metadata from Supabase
    result = supabase.table("files").select("*").in_("id", selected_file_ids).execute()
    
    if not result.data:
        return {"images": []}
    
    # Generate signed URLs for each image
    image_refs = []
    for file_record in result.data:
        if file_record.get("status") == "uploaded":
            try:
                signed_url = r2.client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': R2_BUCKET,
                        'Key': file_record["path"],
                    },
                    ExpiresIn=3600  # 1 hour
                )
                image_refs.append(signed_url)
            except Exception as e:
                logger.warning("Failed to generate signed URL for file %s: %s", file_record["id"], str(e))
    
    return {"images": image_refs}


@executor("AudioBucket")
async def _exec_audio_bucket(params: dict, inputs: dict) -> dict[str, Any]:
    """Fetch selected audio files from storage and return as AudioRef list."""
    from app.db.supabase import get_supabase
    from app.storage.r2 import get_r2, R2_BUCKET
    
    selected_file_ids = params.get("selected_file_ids", [])
    if not selected_file_ids:
        return {"audio": []}
    
    supabase = get_supabase().client
    r2 = get_r2()
    
    # Fetch file metadata from Supabase
    result = supabase.table("files").select("*").in_("id", selected_file_ids).execute()
    
    if not result.data:
        return {"audio": []}
    
    # Generate signed URLs for each audio file
    audio_refs = []
    for file_record in result.data:
        if file_record.get("status") == "uploaded":
            try:
                signed_url = r2.client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': R2_BUCKET,
                        'Key': file_record["path"],
                    },
                    ExpiresIn=3600  # 1 hour
                )
                audio_refs.append(signed_url)
            except Exception as e:
                logger.warning("Failed to generate signed URL for file %s: %s", file_record["id"], str(e))
    
    return {"audio": audio_refs}


@executor("VideoBucket")
async def _exec_video_bucket(params: dict, inputs: dict) -> dict[str, Any]:
    """Fetch selected video files from storage and return as VideoRef list."""
    from app.db.supabase import get_supabase
    from app.storage.r2 import get_r2, R2_BUCKET
    
    selected_file_ids = params.get("selected_file_ids", [])
    if not selected_file_ids:
        return {"videos": []}
    
    supabase = get_supabase().client
    r2 = get_r2()
    
    # Fetch file metadata from Supabase
    result = supabase.table("files").select("*").in_("id", selected_file_ids).execute()
    
    if not result.data:
        return {"videos": []}
    
    # Generate signed URLs for each video file
    video_refs = []
    for file_record in result.data:
        if file_record.get("status") == "uploaded":
            try:
                signed_url = r2.client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': R2_BUCKET,
                        'Key': file_record["path"],
                    },
                    ExpiresIn=3600  # 1 hour
                )
                video_refs.append(signed_url)
            except Exception as e:
                logger.warning("Failed to generate signed URL for file %s: %s", file_record["id"], str(e))
    
    return {"videos": video_refs}


@executor("TextBucket")
async def _exec_text_bucket(params: dict, inputs: dict) -> dict[str, Any]:
    """Fetch selected text files from storage, read content, and return as Text list."""
    from app.db.supabase import get_supabase
    from app.storage.r2 import get_r2, R2_BUCKET
    import httpx
    
    selected_file_ids = params.get("selected_file_ids", [])
    if not selected_file_ids:
        logger.info("TextBucket: No file IDs selected")
        return {"text": []}
    
    logger.info("TextBucket: Processing %d selected file IDs", len(selected_file_ids))
    
    supabase = get_supabase().client
    r2 = get_r2()
    
    # Fetch file metadata from Supabase
    result = supabase.table("files").select("*").in_("id", selected_file_ids).execute()
    
    if not result.data:
        logger.warning("TextBucket: No files found in database for IDs: %s", selected_file_ids)
        return {"text": []}
    
    # Read content from each text file
    text_contents = []
    for file_record in result.data:
        if file_record.get("status") == "uploaded":
            try:
                # Generate signed URL
                signed_url = r2.client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': R2_BUCKET,
                        'Key': file_record["path"],
                    },
                    ExpiresIn=3600  # 1 hour
                )
                # Download and read content
                async with httpx.AsyncClient() as client:
                    response = await client.get(signed_url)
                    response.raise_for_status()
                    content = response.text
                    text_contents.append(content)
                    logger.debug("TextBucket: Read %d chars from file %s", len(content), file_record["id"])
            except Exception as e:
                logger.warning("Failed to read text file %s: %s", file_record["id"], str(e))
    
    logger.info("TextBucket: Returning %d text items (total %d chars)", 
                len(text_contents), sum(len(t) for t in text_contents))
    return {"text": text_contents}


@executor("End")
async def _exec_end(params: dict, inputs: dict) -> dict[str, Any]:
    # End node just collects; outputs are extracted separately
    return {}


@executor("TextGeneration")
async def _exec_text_generation(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Generate text using LLM.

    Expected inputs (after shape conversion in resolve_node_inputs):
    - text: str (single text string, automatically converted from TextBucket list if needed)

    Returns:
    - generated_text: str (the generated text content)
    """
    from app.agents.text_generation.generator import generate_text

    text = inputs.get("text", "")

    # Validate input (shape conversion should have already happened)
    if not isinstance(text, str):
        raise ValueError(f"Expected text to be a string (shape conversion should have handled list→single), got {type(text).__name__}")

    preset_id = params.get("preset_id", "")
    if not preset_id:
        raise ValueError("TextGeneration node requires 'preset_id' in params")

    result = generate_text(input_text=text, preset_id=preset_id)

    # Extract text content from result
    # Result is either {"content": "..."} or a structured JSON object
    if isinstance(result, dict):
        # Try common keys for text content
        if "content" in result:
            generated_text = result["content"]
        elif "text" in result:
            generated_text = result["text"]
        elif "output" in result:
            generated_text = result["output"]
        else:
            # Fallback: convert the whole dict to a formatted string
            import json
            generated_text = json.dumps(result, indent=2)
    else:
        generated_text = str(result)

    return {"generated_text": generated_text}


@executor("ImageGeneration")
async def _exec_image_generation(params: dict, inputs: dict) -> dict[str, Any]:
    from app.agents.image_generation.generator import (
        generate_image_from_text,
        generate_image_from_image,
    )

    prompt = inputs.get("prompt", "")
    image = inputs.get("image")
    aspect_ratio = params.get("aspect_ratio", "1:1")

    if image:
        base64_data, error = generate_image_from_image(
            prompt=prompt, input_image_base64=image, aspect_ratio=aspect_ratio
        )
    else:
        base64_data, error = generate_image_from_text(
            prompt=prompt, aspect_ratio=aspect_ratio
        )

    if error:
        raise RuntimeError(f"Image generation failed: {error}")

    return {"generated_image": base64_data}


@executor("Transcription")
async def _exec_transcription(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Transcribe audio/video to text.

    Expected inputs (after shape conversion in resolve_node_inputs):
    - audio: str (optional, single AudioRef signed URL)
    - video: str (optional, single VideoRef signed URL)

    At least one of audio or video must be provided.
    """
    import tempfile
    import httpx
    import os

    from audio_transcription.audio_transcription import transcribe_audio_or_video_file

    audio = inputs.get("audio", "")
    video = inputs.get("video", "")

    # Use audio if provided, otherwise use video
    media_url = audio if audio else video

    if not media_url:
        raise ValueError("Transcription requires either audio or video input")

    # Validate input type
    if not isinstance(media_url, str):
        raise ValueError(f"Expected media URL to be a string, got {type(media_url).__name__}")

    # If media is a URL, download to a temp file
    media_path = None
    if media_url.startswith("http://") or media_url.startswith("https://"):
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(media_url)
            resp.raise_for_status()
            suffix = os.path.splitext(media_url.split("?")[0])[-1] or ".mp4"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                f.write(resp.content)
                media_path = f.name
    else:
        media_path = media_url

    # Retry logic for intermittent Fireworks API failures
    max_retries = 3
    retry_delay = 2  # seconds, will double each retry
    last_error = None

    try:
        for attempt in range(max_retries):
            try:
                logger.info("Transcription: calling transcribe_audio_or_video_file on %s (attempt %d/%d)",
                           media_path, attempt + 1, max_retries)
                segments = transcribe_audio_or_video_file(media_path)

                if segments is None:
                    logger.warning("Transcription: API returned no segments (attempt %d/%d)",
                                  attempt + 1, max_retries)
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_delay * (2 ** attempt))
                        continue
                    else:
                        raise RuntimeError("Transcription failed - API returned no segments after all retries")

                logger.info("Transcription: got %d segments", len(segments))
                joined = " ".join(seg["text"] for seg in segments)
                return {"transcription": joined}

            except RuntimeError:
                raise  # Re-raise our own RuntimeError
            except Exception as e:
                last_error = e
                logger.warning("Transcription attempt %d/%d failed: %s", attempt + 1, max_retries, e)
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))
                else:
                    logger.exception("Transcription failed after %d attempts: %s", max_retries, e)
                    raise RuntimeError(f"Transcription failed after {max_retries} attempts: {e}")

        # Should not reach here, but just in case
        raise RuntimeError(f"Transcription failed: {last_error}")

    finally:
        # Clean up temp file if we downloaded one
        if media_path and media_path != media_url and os.path.exists(media_path):
            os.unlink(media_path)


@executor("ImageMatching")
async def _exec_image_matching(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Match images with text using VLM.

    Expected inputs (after shape conversion in resolve_node_inputs):
    - images: list[ImageRef] (list of signed URLs from ImageBucket)
    - text: str (single text string, automatically converted from TextBucket list if needed)

    Returns:
    - matches: list of dicts with image_url, similarity_score, caption, and ocr_text
    """
    import base64
    import io
    import httpx
    from PIL import Image as PILImage

    images = inputs.get("images", [])
    text = inputs.get("text", "")

    # Validate inputs (shape conversion should have already happened)
    if not images:
        raise ValueError("No images provided to ImageMatching node")
    if not isinstance(images, list):
        raise ValueError(f"Expected images to be a list, got {type(images).__name__}")
    if not text:
        raise ValueError("No text provided to ImageMatching node")
    if not isinstance(text, str):
        raise ValueError(f"Expected text to be a string (shape conversion should have handled list→single), got {type(text).__name__}")

    logger.info("ImageMatching processing %d images with text: %s...", len(images), text[:100])

    # Import VLM components
    try:
        from app.agents.image_text_matching.config_vlm_v2 import VLMConfig
        from app.agents.image_text_matching.utils_vlm_v2 import (
            parse_numeric_response,
            format_image_content
        )
        from fireworks.client import AsyncFireworks
    except ImportError as e:
        logger.error("Failed to import VLM components: %s", e)
        raise RuntimeError(f"VLM components not available: {e}")

    # Use AsyncFireworks as context manager to ensure proper cleanup
    api_key = VLMConfig.get_api_key()
    matches = []

    async with AsyncFireworks(api_key=api_key) as client:
        for idx, image_url in enumerate(images):
            try:
                logger.info("Processing image %d/%d: %s", idx + 1, len(images), image_url[:80] if len(image_url) > 80 else image_url)

                # Handle both HTTP URLs and base64 data URLs
                if image_url.startswith("data:"):
                    # Already a base64 data URL - decode it
                    try:
                        # Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
                        header, encoded = image_url.split(",", 1)
                        image_bytes = base64.b64decode(encoded)
                        img = PILImage.open(io.BytesIO(image_bytes))
                    except Exception as e:
                        logger.error("Failed to decode base64 image: %s", e)
                        raise ValueError(f"Invalid base64 image data: {e}")
                elif image_url.startswith("http://") or image_url.startswith("https://"):
                    # Download image from HTTP URL
                    resp = httpx.get(image_url, timeout=30)
                    resp.raise_for_status()
                    img = PILImage.open(io.BytesIO(resp.content))
                else:
                    raise ValueError(f"Unsupported image source: {image_url[:50]}...")

                if img.mode != 'RGB':
                    img = img.convert('RGB')

                # Optionally resize large images
                max_dim = 1024
                if img.width > max_dim or img.height > max_dim:
                    ratio = max_dim / max(img.width, img.height)
                    new_size = (int(img.width * ratio), int(img.height * ratio))
                    img = img.resize(new_size, PILImage.Resampling.LANCZOS)

                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                image_bytes = buffer.getvalue()
                base64_str = base64.b64encode(image_bytes).decode('utf-8')
                image_base64 = f"data:image/jpeg;base64,{base64_str}"

                # Generate caption
                caption_prompt = (
                    "Describe this image in 1-2 sentences. "
                    "Focus on: main subjects, activities, visible objects, text/graphics, and setting. "
                    "Be concise and factual."
                )
                caption_response = client.chat.completions.create(
                    model=VLMConfig.FIREWORKS_MODEL,
                    messages=[{
                        "role": "user",
                        "content": format_image_content(image_base64, caption_prompt)
                    }],
                    max_tokens=150,
                    temperature=0.3
                )
                caption = caption_response.choices[0].message.content.strip()

                # Extract OCR text
                ocr_prompt = (
                    "Extract all visible text from this image. "
                    "Return only the text you see, with no additional commentary. "
                    "If no text is visible, respond with 'NONE'."
                )
                ocr_response = client.chat.completions.create(
                    model=VLMConfig.FIREWORKS_MODEL,
                    messages=[{
                        "role": "user",
                        "content": format_image_content(image_base64, ocr_prompt)
                    }],
                    max_tokens=500,
                    temperature=0.1
                )
                ocr_text = ocr_response.choices[0].message.content.strip()
                if ocr_text.upper() == "NONE":
                    ocr_text = ""

                # Compute similarity score
                similarity_prompt = (
                    f"Rate how well this image matches the following text on a scale from 0 to 100, where:\n"
                    f"- 0 = completely unrelated\n"
                    f"- 50 = somewhat related (shares general topic)\n"
                    f"- 100 = perfect match (image directly illustrates the text)\n\n"
                    f"Text to match:\n\"\"\"{text}\"\"\"\n\n"
                    f"Respond with ONLY a number from 0-100, no explanation."
                )
                similarity_response = client.chat.completions.create(
                    model=VLMConfig.FIREWORKS_MODEL,
                    messages=[{
                        "role": "user",
                        "content": format_image_content(image_base64, similarity_prompt)
                    }],
                    max_tokens=10,
                    temperature=0.1
                )
                similarity_text = similarity_response.choices[0].message.content.strip()

                try:
                    similarity_score = parse_numeric_response(similarity_text) / 100.0
                    similarity_score = max(0.0, min(1.0, similarity_score))
                except ValueError:
                    logger.warning("Could not parse similarity score: %s", similarity_text)
                    similarity_score = 0.5

                matches.append({
                    "image_url": image_url,
                    "similarity_score": similarity_score,
                    "caption": caption,
                    "ocr_text": ocr_text,
                })

                logger.info("Image %d matched with score %.2f", idx + 1, similarity_score)

            except Exception as e:
                logger.error("Error processing image %d: %s", idx + 1, e)
                matches.append({
                    "image_url": image_url,
                    "similarity_score": 0.0,
                    "caption": "",
                    "ocr_text": "",
                    "error": str(e),
                })

    # Sort by similarity score descending
    matches.sort(key=lambda x: x.get("similarity_score", 0), reverse=True)

    logger.info("ImageMatching completed: %d images processed", len(matches))

    return {"matches": matches}


@executor("ImageExtraction")
async def _exec_image_extraction(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Extract keyframes from video.

    Expected inputs (after shape conversion in resolve_node_inputs):
    - source: str (single VideoRef signed URL, automatically converted from VideoBucket list if needed)

    Returns:
    - images: list of base64 data URLs for extracted keyframes
    """
    import tempfile
    import httpx
    import os
    import asyncio
    from pathlib import Path

    source = inputs.get("source", "")

    # Validate input (shape conversion should have already happened)
    if not source:
        raise ValueError("No video source provided to ImageExtraction node")
    if not isinstance(source, str):
        raise ValueError(f"Expected source to be a string (shape conversion should have handled list→single), got {type(source).__name__}")

    logger.info("ImageExtraction processing video: %s...", source[:80])

    # If source is a URL, download to a temp file
    video_path = None
    temp_dir = None
    try:
        if source.startswith("http://") or source.startswith("https://"):
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.get(source)
                resp.raise_for_status()
                # Determine file extension from URL or default to .mp4
                suffix = os.path.splitext(source.split("?")[0])[-1] or ".mp4"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                    f.write(resp.content)
                    video_path = f.name
        else:
            video_path = source

        # Run the keyframe extraction pipeline
        from app.agents.image_extraction.keyframe_pipeline import run_keyframe_pipeline

        # Create output directory for extracted frames
        app_root = Path(__file__).resolve().parent.parent
        output_dir = app_root / "agents" / "image_extraction" / "outputs" / "keyframes"
        output_dir.mkdir(parents=True, exist_ok=True)

        config = {"output_dir": str(output_dir)}
        result = await asyncio.to_thread(run_keyframe_pipeline, video_path, config)

        # Convert extracted frames to base64 data URLs
        import base64

        selected_frames = result.get("selected_frames", [])
        image_refs = []

        for frame in selected_frames:
            image_path = frame.get("selected_path") or frame.get("frame_path")
            if not image_path or not os.path.exists(image_path):
                continue

            # Determine MIME type
            suffix = Path(image_path).suffix.lower().lstrip(".")
            if suffix in ("jpg", "jpeg"):
                mime = "image/jpeg"
            elif suffix in ("png", "webp"):
                mime = f"image/{suffix}"
            else:
                mime = "image/jpeg"

            # Read and encode to base64
            with open(image_path, "rb") as img_file:
                encoded = base64.b64encode(img_file.read()).decode("ascii")
            data_url = f"data:{mime};base64,{encoded}"
            image_refs.append(data_url)

        logger.info("ImageExtraction completed: extracted %d keyframes", len(image_refs))
        return {"images": image_refs}

    finally:
        # Clean up temp file if we downloaded one
        if video_path and video_path != source and os.path.exists(video_path):
            try:
                os.unlink(video_path)
            except Exception:
                pass


@executor("ImageExtractionJB")
async def _exec_image_extraction_jb(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Extract keyframes from video using JB edition pipeline.

    Expected inputs (after shape conversion in resolve_node_inputs):
    - source: str (single VideoRef signed URL, automatically converted from VideoBucket list if needed)

    Returns:
    - images: list of base64 data URLs for extracted keyframes
    """
    import tempfile
    import httpx
    import os
    import asyncio
    from pathlib import Path

    source = inputs.get("source", "")

    # Validate input (shape conversion should have already happened)
    if not source:
        raise ValueError("No video source provided to ImageExtractionJB node")
    if not isinstance(source, str):
        raise ValueError(f"Expected source to be a string (shape conversion should have handled list→single), got {type(source).__name__}")

    logger.info("ImageExtractionJB processing video: %s...", source[:80])

    # If source is a URL, download to a temp file
    video_path = None
    try:
        if source.startswith("http://") or source.startswith("https://"):
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.get(source)
                resp.raise_for_status()
                # Determine file extension from URL or default to .mp4
                suffix = os.path.splitext(source.split("?")[0])[-1] or ".mp4"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                    f.write(resp.content)
                    video_path = f.name
        else:
            video_path = source

        # Run the JB keyframe extraction pipeline
        from app.agents.image_extraction.keyframe_pipeline_jb import run_keyframe_pipeline_jb

        # Create output directory for extracted frames
        app_root = Path(__file__).resolve().parent.parent
        output_dir = app_root / "agents" / "image_extraction" / "outputs" / "keyframes"
        output_dir.mkdir(parents=True, exist_ok=True)

        config = {"output_dir": str(output_dir)}
        result = await asyncio.to_thread(run_keyframe_pipeline_jb, video_path, config)

        # Convert extracted frames to base64 data URLs
        import base64

        selected_frames = result.get("selected_frames", [])
        image_refs = []

        for frame in selected_frames:
            image_path = frame.get("selected_path") or frame.get("frame_path")
            if not image_path or not os.path.exists(image_path):
                continue

            # Determine MIME type
            suffix = Path(image_path).suffix.lower().lstrip(".")
            if suffix in ("jpg", "jpeg"):
                mime = "image/jpeg"
            elif suffix in ("png", "webp"):
                mime = f"image/{suffix}"
            else:
                mime = "image/jpeg"

            # Read and encode to base64
            with open(image_path, "rb") as img_file:
                encoded = base64.b64encode(img_file.read()).decode("ascii")
            data_url = f"data:{mime};base64,{encoded}"
            image_refs.append(data_url)

        logger.info("ImageExtractionJB completed: extracted %d keyframes", len(image_refs))
        return {"images": image_refs}

    finally:
        # Clean up temp file if we downloaded one
        if video_path and video_path != source and os.path.exists(video_path):
            try:
                os.unlink(video_path)
            except Exception:
                pass


@executor("QuoteExtraction")
async def _exec_quote_extraction(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Extract curated quotes from input text.

    Expected inputs (after shape conversion in resolve_node_inputs):
    - text: str

    Params:
    - style: "punchy" | "insightful" | "contrarian" | "emotional" (default: punchy)
    - count: int (default: 10)
    """
    from app.agents.quote_extraction.extractor import extract_quotes

    text = inputs.get("text", "")
    if not text or not isinstance(text, str):
        raise ValueError("No text provided to QuoteExtraction node")

    style = params.get("style") or "punchy"
    count = params.get("count") or 10
    try:
        count = int(count)
    except Exception:
        count = 10

    quotes = await extract_quotes(transcript=text, style=str(style), count=count)
    return {"quotes": quotes}


# ---------------------------------------------------------------------------
# Main execution function (parallel)
# ---------------------------------------------------------------------------


async def execute_workflow(
    blueprint: Blueprint,
) -> WorkflowExecutionResult:
    """
    Execute a compiled Blueprint with parallel execution of independent nodes.

    Nodes execute as soon as all their dependencies complete. On error in any
    node, cancels running tasks and returns partial results.
    """
    start_time = time.perf_counter()
    node_outputs: dict[str, dict[str, Any]] = {}
    node_results: list[NodeExecutionResult] = []
    node_map = {n.node_id: n for n in blueprint.nodes}

    # Build dependency graph
    in_degree, adjacency, _ = _build_dependency_graph(blueprint)

    # Track error state
    error_occurred: asyncio.Event = asyncio.Event()
    first_error: dict[str, Any] = {}

    async def execute_single_node(node_id: str) -> NodeExecutionResult:
        """Execute a single node and return its result."""
        bp_node = node_map.get(node_id)
        if bp_node is None:
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error=f"Node {node_id} not found in blueprint",
            )

        exec_fn = _registry.get(bp_node.type)
        if exec_fn is None:
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error=f"No executor for node type '{bp_node.type}'",
            )

        node_start = time.perf_counter()
        try:
            resolved_inputs = resolve_node_inputs(
                node_id=node_id,
                node_type=bp_node.type,
                connections=blueprint.connections,
                node_outputs=node_outputs,
                blueprint=blueprint,
            )

            # Log resolved inputs for debugging (especially for ImageMatching)
            if bp_node.type == "ImageMatching":
                logger.info(
                    "ImageMatching node %s resolved inputs: images=%s, text=%s",
                    node_id,
                    type(resolved_inputs.get("images")),
                    type(resolved_inputs.get("text")),
                )
                if isinstance(resolved_inputs.get("images"), list):
                    logger.info(
                        "ImageMatching received %d images",
                        len(resolved_inputs.get("images", [])),
                    )
                if resolved_inputs.get("text"):
                    text_val = resolved_inputs.get("text")
                    if isinstance(text_val, str):
                        logger.info("ImageMatching text preview: %s", text_val[:100])
                    elif isinstance(text_val, list):
                        logger.info(
                            "ImageMatching text is a list with %d items", len(text_val)
                        )

            outputs = await exec_fn(bp_node.params, resolved_inputs)
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)

            return NodeExecutionResult(
                node_id=node_id,
                status="completed",
                outputs=outputs,
                execution_time_ms=elapsed_ms,
            )

        except asyncio.CancelledError:
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error="Execution cancelled",
                execution_time_ms=elapsed_ms,
            )

        except Exception as e:
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)
            error_msg = f"{type(e).__name__}: {e}"
            logger.exception("Node %s failed: %s", node_id, error_msg)
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error=error_msg,
                execution_time_ms=elapsed_ms,
            )

    # Initialize ready queue with nodes that have no dependencies
    ready_queue: list[str] = [nid for nid, deg in in_degree.items() if deg == 0]
    pending_tasks: dict[asyncio.Task, str] = {}  # task -> node_id
    completed_count = 0
    total_nodes = len(blueprint.nodes)

    while completed_count < total_nodes and not error_occurred.is_set():
        # Launch tasks for all ready nodes
        while ready_queue and not error_occurred.is_set():
            node_id = ready_queue.pop(0)
            task = asyncio.create_task(execute_single_node(node_id))
            pending_tasks[task] = node_id
            logger.debug("Started execution of node %s", node_id)

        if not pending_tasks:
            # No tasks running and nothing ready - should not happen with valid DAG
            break

        # Wait for at least one task to complete
        done, _ = await asyncio.wait(
            pending_tasks.keys(), return_when=asyncio.FIRST_COMPLETED
        )

        for task in done:
            node_id = pending_tasks.pop(task)
            result = task.result()
            node_results.append(result)
            completed_count += 1

            if result.status == "error":
                # Signal error to stop further execution
                error_occurred.set()
                first_error["node_id"] = node_id
                first_error["error"] = result.error
                break

            # Store outputs and unblock downstream nodes
            if result.outputs:
                node_outputs[node_id] = result.outputs

            for downstream in adjacency[node_id]:
                in_degree[downstream] -= 1
                if in_degree[downstream] == 0:
                    ready_queue.append(downstream)
                    logger.debug("Node %s now ready (unblocked by %s)", downstream, node_id)

    # Cancel any remaining tasks on error
    if error_occurred.is_set() and pending_tasks:
        for task in pending_tasks:
            task.cancel()
        # Wait for cancellation to complete
        if pending_tasks:
            await asyncio.gather(*pending_tasks.keys(), return_exceptions=True)
            # Record cancelled tasks
            for task, node_id in pending_tasks.items():
                try:
                    result = task.result()
                    node_results.append(result)
                except asyncio.CancelledError:
                    node_results.append(
                        NodeExecutionResult(
                            node_id=node_id,
                            status="error",
                            error="Execution cancelled due to upstream error",
                        )
                    )

    # Check for error
    if error_occurred.is_set():
        return WorkflowExecutionResult(
            success=False,
            workflow_outputs={},
            node_results=node_results,
            total_execution_time_ms=int((time.perf_counter() - start_time) * 1000),
            error=f"Execution stopped at node {first_error.get('node_id')}: {first_error.get('error')}",
        )

    # Extract workflow outputs
    workflow_outputs: dict[str, Any] = {}
    for wf_output in blueprint.workflow_outputs:
        upstream = node_outputs.get(wf_output.from_node, {})
        val = upstream.get(wf_output.from_output)
        if val is not None:
            workflow_outputs[wf_output.key] = val

    total_ms = int((time.perf_counter() - start_time) * 1000)
    return WorkflowExecutionResult(
        success=True,
        workflow_outputs=workflow_outputs,
        node_results=node_results,
        total_execution_time_ms=total_ms,
    )


# ---------------------------------------------------------------------------
# Streaming execution (SSE) with parallel execution
# ---------------------------------------------------------------------------


async def execute_workflow_streaming(
    blueprint: Blueprint,
):
    """
    Execute a compiled Blueprint with parallel execution and yield SSE events.

    Nodes execute concurrently when their dependencies are satisfied. Events are
    yielded as nodes start and complete, in the order they occur.

    Yields JSON events:
    - {"event": "workflow_start", "execution_order": [...], "total_nodes": N}
    - {"event": "node_start", "node_id": "...", "node_type": "..."}
    - {"event": "node_complete", "node_id": "...", "status": "completed", "outputs": {...}, "execution_time_ms": ...}
    - {"event": "node_error", "node_id": "...", "error": "...", "execution_time_ms": ...}
    - {"event": "workflow_complete", "success": true, "workflow_outputs": {...}, "total_execution_time_ms": ...}
    - {"event": "workflow_error", "error": "...", "total_execution_time_ms": ...}
    """
    import json

    start_time = time.perf_counter()
    node_outputs: dict[str, dict[str, Any]] = {}
    node_results: list[NodeExecutionResult] = []
    node_map = {n.node_id: n for n in blueprint.nodes}

    # Build dependency graph
    in_degree, adjacency, _ = _build_dependency_graph(blueprint)

    # Event queue for SSE - decouples execution from streaming
    event_queue: asyncio.Queue = asyncio.Queue()

    # Track error state
    error_occurred = asyncio.Event()
    first_error: dict[str, Any] = {}

    async def execute_single_node(node_id: str) -> NodeExecutionResult:
        """Execute a single node and return its result."""
        bp_node = node_map.get(node_id)
        if bp_node is None:
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error=f"Node {node_id} not found in blueprint",
            )

        exec_fn = _registry.get(bp_node.type)
        if exec_fn is None:
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error=f"No executor for node type '{bp_node.type}'",
            )

        node_start = time.perf_counter()
        try:
            resolved_inputs = resolve_node_inputs(
                node_id=node_id,
                node_type=bp_node.type,
                connections=blueprint.connections,
                node_outputs=node_outputs,
                blueprint=blueprint,
            )

            outputs = await exec_fn(bp_node.params, resolved_inputs)
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)

            return NodeExecutionResult(
                node_id=node_id,
                status="completed",
                outputs=outputs,
                execution_time_ms=elapsed_ms,
            )

        except asyncio.CancelledError:
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error="Execution cancelled",
                execution_time_ms=elapsed_ms,
            )

        except Exception as e:
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)
            error_msg = f"{type(e).__name__}: {e}"
            logger.exception("Node %s failed: %s", node_id, error_msg)
            return NodeExecutionResult(
                node_id=node_id,
                status="error",
                error=error_msg,
                execution_time_ms=elapsed_ms,
            )

    async def coordinator():
        """Coordinate parallel execution and push events to queue."""
        nonlocal node_outputs

        # Initialize ready queue with nodes that have no dependencies
        ready_queue: list[str] = [nid for nid, deg in in_degree.items() if deg == 0]
        pending_tasks: dict[asyncio.Task, str] = {}  # task -> node_id
        completed_count = 0
        total_nodes = len(blueprint.nodes)

        try:
            while completed_count < total_nodes and not error_occurred.is_set():
                # Launch tasks for all ready nodes
                while ready_queue and not error_occurred.is_set():
                    node_id = ready_queue.pop(0)
                    bp_node = node_map.get(node_id)

                    # Emit node_start event
                    await event_queue.put({
                        "event": "node_start",
                        "node_id": node_id,
                        "node_type": bp_node.type if bp_node else "unknown",
                    })

                    task = asyncio.create_task(execute_single_node(node_id))
                    pending_tasks[task] = node_id
                    logger.debug("Started execution of node %s", node_id)

                if not pending_tasks:
                    break

                # Wait for at least one task to complete
                done, _ = await asyncio.wait(
                    pending_tasks.keys(), return_when=asyncio.FIRST_COMPLETED
                )

                for task in done:
                    node_id = pending_tasks.pop(task)
                    result = task.result()
                    node_results.append(result)
                    completed_count += 1

                    if result.status == "error":
                        # Emit node_error event
                        await event_queue.put({
                            "event": "node_error",
                            "node_id": node_id,
                            "error": result.error,
                            "execution_time_ms": result.execution_time_ms,
                        })

                        # Signal error to stop further execution
                        error_occurred.set()
                        first_error["node_id"] = node_id
                        first_error["error"] = result.error
                        break

                    # Store outputs and emit node_complete event
                    if result.outputs:
                        node_outputs[node_id] = result.outputs

                    await event_queue.put({
                        "event": "node_complete",
                        "node_id": node_id,
                        "status": "completed",
                        "outputs": result.outputs,
                        "execution_time_ms": result.execution_time_ms,
                    })

                    # Unblock downstream nodes
                    for downstream in adjacency[node_id]:
                        in_degree[downstream] -= 1
                        if in_degree[downstream] == 0:
                            ready_queue.append(downstream)
                            logger.debug(
                                "Node %s now ready (unblocked by %s)", downstream, node_id
                            )

            # Cancel any remaining tasks on error
            if error_occurred.is_set() and pending_tasks:
                for task in pending_tasks:
                    task.cancel()
                if pending_tasks:
                    await asyncio.gather(*pending_tasks.keys(), return_exceptions=True)
                    for task, node_id in pending_tasks.items():
                        try:
                            result = task.result()
                            node_results.append(result)
                        except asyncio.CancelledError:
                            node_results.append(
                                NodeExecutionResult(
                                    node_id=node_id,
                                    status="error",
                                    error="Execution cancelled due to upstream error",
                                )
                            )

            # Emit final event
            if error_occurred.is_set():
                await event_queue.put({
                    "event": "workflow_error",
                    "error": f"Execution stopped at node {first_error.get('node_id')}: {first_error.get('error')}",
                    "total_execution_time_ms": int(
                        (time.perf_counter() - start_time) * 1000
                    ),
                    "node_results": [nr.model_dump() for nr in node_results],
                })
            else:
                # Extract workflow outputs
                workflow_outputs: dict[str, Any] = {}
                for wf_output in blueprint.workflow_outputs:
                    upstream = node_outputs.get(wf_output.from_node, {})
                    val = upstream.get(wf_output.from_output)
                    if val is not None:
                        workflow_outputs[wf_output.key] = val

                await event_queue.put({
                    "event": "workflow_complete",
                    "success": True,
                    "workflow_outputs": workflow_outputs,
                    "total_execution_time_ms": int(
                        (time.perf_counter() - start_time) * 1000
                    ),
                    "node_results": [nr.model_dump() for nr in node_results],
                })

        except Exception as e:
            logger.exception("Coordinator error: %s", e)
            await event_queue.put({
                "event": "workflow_error",
                "error": f"Internal error: {type(e).__name__}: {e}",
                "total_execution_time_ms": int(
                    (time.perf_counter() - start_time) * 1000
                ),
                "node_results": [nr.model_dump() for nr in node_results],
            })

        finally:
            # Signal end of events
            await event_queue.put(None)

    # Emit workflow_start event
    start_event = {
        "event": "workflow_start",
        "execution_order": blueprint.execution_order,
        "total_nodes": len(blueprint.execution_order),
    }
    yield f"data: {json.dumps(start_event)}\n\n"

    # Start coordinator as background task
    coordinator_task = asyncio.create_task(coordinator())

    # Yield events from queue as they arrive
    try:
        while True:
            event = await event_queue.get()
            if event is None:  # Sentinel for completion
                break
            yield f"data: {json.dumps(event)}\n\n"
    finally:
        # Ensure coordinator completes
        if not coordinator_task.done():
            coordinator_task.cancel()
            try:
                await coordinator_task
            except asyncio.CancelledError:
                pass


# ---------------------------------------------------------------------------
# Execution log persistence
# ---------------------------------------------------------------------------


def save_execution_log(
    result: WorkflowExecutionResult,
    workflow_id: str | None,
    user_id: str,
    blueprint: Blueprint | None = None,
) -> None:
    """Persist a lightweight execution summary to executions table."""
    # Allow saving logs even for unsaved workflows (workflow_id = None)

    node_summaries = [
        {
            "node_id": nr.node_id,
            "status": nr.status,
            "error": nr.error,
            "execution_time_ms": nr.execution_time_ms,
        }
        for nr in result.node_results
    ]

    nodes_completed = sum(1 for nr in result.node_results if nr.status == "completed")
    nodes_errored = sum(1 for nr in result.node_results if nr.status == "error")

    row = {
        "workflow_id": workflow_id,
        "user_id": user_id,
        "success": result.success,
        "error": result.error,
        "total_execution_time_ms": result.total_execution_time_ms,
        "node_count": len(result.node_results),
        "nodes_completed": nodes_completed,
        "nodes_errored": nodes_errored,
        "node_summaries": node_summaries,
    }
    
    # Add blueprint if provided (serialize to dict for JSONB storage)
    # Use mode='json' to properly serialize datetime objects to ISO strings
    if blueprint:
        row["blueprint"] = blueprint.model_dump(mode='json')

    try:
        supabase = get_supabase().client
        result = supabase.table("executions").insert(row).execute()
        if not result.data:
            logger.warning("Execution log insert returned no data for workflow %s", workflow_id)
    except Exception as e:
        logger.exception("Failed to save execution log for workflow %s: %s", workflow_id, str(e))
        # Don't raise - execution logging failure shouldn't break the workflow
