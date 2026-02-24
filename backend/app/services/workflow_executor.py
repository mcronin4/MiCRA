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
import json
import os
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
    node_type: str | None = None
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
    persistence_warning: str | None = None


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


def _normalize_text_segment(value: Any) -> str:
    """Normalize an arbitrary value into a text segment for fan-in merge."""
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n\n".join(str(item) for item in value if item is not None and str(item).strip())
    return str(value)


def _merge_text_input_values(existing: Any, incoming: Any) -> str:
    """Merge two text values into one deterministic blank-line separated string."""
    parts: list[str] = []
    existing_text = _normalize_text_segment(existing).strip()
    incoming_text = _normalize_text_segment(incoming).strip()
    if existing_text:
        parts.append(existing_text)
    if incoming_text:
        parts.append(incoming_text)
    return "\n\n".join(parts)


def _as_list(value: Any) -> list[Any]:
    """Normalize any value to list form for generic fan-in merging."""
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if item is not None]
    return [value]


def _merge_input_values(
    existing: Any,
    incoming: Any,
    *,
    runtime_type: str,
    target_shape: str,
    input_key: str,
    node_type: str,
) -> Any:
    """
    Merge two values for the same input key with deterministic fan-in rules.

    Rules:
    - Text: blank-line join.
    - Non-text values: always normalize to concatenated list.
      This preserves full fan-in for all media/runtime types, including
      single-shaped target ports. Node executors can then decide how to
      consume one-or-many values deterministically.
    """
    if runtime_type == "Text":
        return _merge_text_input_values(existing, incoming)

    merged = _as_list(existing) + _as_list(incoming)
    if target_shape == "single" and len(merged) > 1:
        logger.info(
            "Fan-in on single input '%s' for node type '%s': merged %d values",
            input_key,
            node_type,
            len(merged),
        )
    return merged


def resolve_node_inputs(
    node_id: str,
    node_type: str,
    connections: list[BlueprintConnection],
    node_outputs: dict[str, dict[str, Any]],
    blueprint: Blueprint | None = None,
) -> dict[str, Any]:
    """
    Resolve inputs for a node from upstream outputs via connections.

    Performs automatic shape conversion and fan-in merging.

    Fan-in behavior:
    - Text inputs: deterministic blank-line join.
    - list inputs: concatenation.
    - AudioRef/VideoRef single inputs: keep merged list for node-level processing.
    - other single inputs: deterministic first-item fallback when multiple values are present.
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
        if conn.to_node != node_id:
            continue

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
        target_runtime_type: str | None = None
        target_shape: str | None = None
        if target_spec:
            target_port = next(
                (p for p in target_spec.inputs if p.key == conn.to_input),
                None,
            )

            if target_port:
                target_runtime_type = target_port.runtime_type
                target_shape = target_port.shape
                source_shape = None

                # Try to get source port spec from blueprint if available
                if blueprint:
                    source_node = next(
                        (n for n in blueprint.nodes if n.node_id == conn.from_node),
                        None,
                    )
                    if source_node:
                        source_spec = get_node_spec(source_node.type)
                        if source_spec:
                            source_port = next(
                                (p for p in source_spec.outputs if p.key == conn.from_output),
                                None,
                            )
                            if source_port:
                                source_shape = source_port.shape

                # If we couldn't get source shape from blueprint, infer from value type
                if source_shape is None:
                    source_shape = "list" if isinstance(raw_value, list) else "single"

                runtime_type = target_port.runtime_type
                # Preserve list fan-in only for non-text single ports.
                # Text single ports should still normalize to a single string.
                preserve_single_fanin = (
                    target_shape == "single" and runtime_type != "Text"
                )

                # Convert shape if needed (except single fan-in where we keep list)
                if source_shape != target_shape and not preserve_single_fanin:
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

        if conn.to_input in resolved:
            resolved[conn.to_input] = _merge_input_values(
                resolved[conn.to_input],
                raw_value,
                runtime_type=target_runtime_type or "Text",
                target_shape=target_shape or "list",
                input_key=conn.to_input,
                node_type=node_type,
            )
        else:
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

    Optional params:
    - preset_variant: "summary" | "action_items"
      Applies light task steering when a shared preset powers multiple preset labels.
    - tone_guidance_override: string
      Optional runtime override for preset tone guidance.
    - max_length_override: integer
      Optional runtime override for max output length (characters).
    - structure_template_override: string
      Optional runtime override for output structure instructions.
    - prompt_template_override: string
      Optional runtime override for full prompt template.
    - output_format_override: object
      Optional runtime override JSON schema for structured output.

    Returns:
    - generated_text: str (the generated text content)
    """
    from app.agents.text_generation.generator import generate_text

    text = inputs.get("text", "")

    # Defensive normalization: accept list fan-in and convert to string.
    if isinstance(text, list):
        text = "\n\n".join(str(item) for item in text if item is not None and str(item).strip())
    elif not isinstance(text, str):
        text = _normalize_text_segment(text)

    preset_id = params.get("preset_id", "")
    if not preset_id:
        raise ValueError(
            "TextGeneration node requires 'preset_id' in params. "
            "Open the workflow in the editor, select a preset for this node, and save to persist it."
        )

    preset_variant = str(params.get("preset_variant") or "").strip().lower()
    if preset_variant == "summary":
        text = (
            "Task: Provide only a concise summary of the content. "
            "Do not include action items.\n\n"
            f"Source content:\n{text}"
        )
    elif preset_variant == "action_items":
        text = (
            "Task: Extract only actionable next steps as bullet points. "
            "Do not include a narrative summary.\n\n"
            f"Source content:\n{text}"
        )

    max_length_override = params.get("max_length_override")
    if max_length_override is not None:
        try:
            max_length_override = int(max_length_override)
        except Exception:
            logger.warning(
                "Ignoring invalid max_length_override for %s: %r",
                params.get("node_id", "TextGeneration"),
                max_length_override,
            )
            max_length_override = None

    tone_guidance_override = params.get("tone_guidance_override")
    if not isinstance(tone_guidance_override, str) or not tone_guidance_override.strip():
        tone_guidance_override = None
    else:
        tone_guidance_override = tone_guidance_override.strip()

    structure_template_override = params.get("structure_template_override")
    if not isinstance(structure_template_override, str) or not structure_template_override.strip():
        structure_template_override = None
    else:
        structure_template_override = structure_template_override.strip()

    prompt_template_override = params.get("prompt_template_override")
    if not isinstance(prompt_template_override, str) or not prompt_template_override.strip():
        prompt_template_override = None
    else:
        prompt_template_override = prompt_template_override.strip()

    output_format_override = params.get("output_format_override")
    if output_format_override is not None and not isinstance(output_format_override, dict):
        output_format_override = None

    result = generate_text(
        input_text=text,
        preset_id=preset_id,
        tone_guidance_override=tone_guidance_override,
        max_length_override=max_length_override,
        structure_template_override=structure_template_override,
        prompt_template_override=prompt_template_override,
        output_format_override=output_format_override,
    )

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
    import base64
    import mimetypes
    from pathlib import Path
    import httpx

    prompt_input = inputs.get("prompt", "")
    prompt = prompt_input if isinstance(prompt_input, str) else _normalize_text_segment(prompt_input)
    image_input = inputs.get("image")
    aspect_ratio = params.get("aspect_ratio", "1:1")

    def _extract_image_ref(value: Any) -> str | None:
        if isinstance(value, str):
            candidate = value.strip()
            return candidate or None
        if isinstance(value, dict):
            for key in ("image_url", "url", "src", "base64", "data_url"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        return None

    async def _to_data_url(image_ref: str) -> str:
        if image_ref.startswith("data:"):
            return image_ref

        if image_ref.startswith("http://") or image_ref.startswith("https://"):
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(image_ref)
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "").split(";")[0].strip()
                mime_type = content_type or "image/jpeg"
                encoded = base64.b64encode(resp.content).decode("ascii")
                return f"data:{mime_type};base64,{encoded}"

        path = Path(image_ref)
        if path.exists() and path.is_file():
            mime_type = mimetypes.guess_type(str(path))[0] or "image/jpeg"
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            return f"data:{mime_type};base64,{encoded}"

        raise ValueError("Unsupported image input for ImageGeneration")

    image_candidates = _as_list(image_input)
    image_ref: str | None = None
    for candidate in image_candidates:
        image_ref = _extract_image_ref(candidate)
        if image_ref:
            break

    if image_ref:
        normalized_image = await _to_data_url(image_ref)
        base64_data, error = generate_image_from_image(
            prompt=prompt, input_image_base64=normalized_image, aspect_ratio=aspect_ratio
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

    Expected inputs:
    - audio: AudioRef URL or list[AudioRef URL]
    - video: VideoRef URL or list[VideoRef URL]

    Fan-in is supported. Multiple media inputs are transcribed in order and
    concatenated with blank lines.
    """
    import tempfile
    import httpx
    import os
    import asyncio

    from audio_transcription.audio_transcription import transcribe_audio_or_video_file

    def _normalize_media_inputs(value: Any, key: str) -> list[str]:
        if value is None or value == "":
            return []
        if isinstance(value, list):
            out: list[str] = []
            for idx, item in enumerate(value):
                if not isinstance(item, str):
                    raise ValueError(
                        f"Expected {key}[{idx}] to be a string URL, got {type(item).__name__}"
                    )
                if item.strip():
                    out.append(item.strip())
            return out
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        raise ValueError(
            f"Expected {key} to be a string or list of strings, got {type(value).__name__}"
        )

    audio_inputs = _normalize_media_inputs(inputs.get("audio"), "audio")
    video_inputs = _normalize_media_inputs(inputs.get("video"), "video")
    media_inputs = audio_inputs + video_inputs

    if not media_inputs:
        raise ValueError("Transcription requires either audio or video input")

    transcriptions: list[str] = []

    for media_url in media_inputs:
        media_path = None
        try:
            # If media is a URL, download to a temp file
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

            segments = await asyncio.to_thread(transcribe_audio_or_video_file, media_path)
            if segments is None:
                raise RuntimeError("Transcription failed: provider returned no segments")

            transcriptions.append(" ".join(seg["text"] for seg in segments))
        finally:
            # Clean up temp file if we downloaded one
            if media_path and media_path != media_url and os.path.exists(media_path):
                os.unlink(media_path)

    return {"transcription": "\n\n".join(t for t in transcriptions if t)}


@executor("ImageMatching")
async def _exec_image_matching(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Match images with text using VLM and emit image outputs enriched with scores.

    Returns:
    - images: list of objects with `image_url`, `similarity_score`, and `caption`
    """
    import base64
    import io
    import httpx
    from PIL import Image as PILImage

    images_input = _as_list(inputs.get("images"))
    text_input = inputs.get("text", "")
    text = text_input if isinstance(text_input, str) else _normalize_text_segment(text_input)

    def _extract_image_ref(value: Any) -> str | None:
        if isinstance(value, str):
            candidate = value.strip()
            return candidate or None
        if isinstance(value, dict):
            for key in ("image_url", "url", "src", "base64", "data_url"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        return None

    prepared_images: list[tuple[str, dict[str, Any]]] = []
    for raw in images_input:
        image_ref = _extract_image_ref(raw)
        if not image_ref:
            continue
        base_payload = dict(raw) if isinstance(raw, dict) else {}
        base_payload["image_url"] = image_ref
        prepared_images.append((image_ref, base_payload))

    if not prepared_images:
        raise ValueError("No images provided to ImageMatching node")
    if not text:
        raise ValueError("No text provided to ImageMatching node")

    logger.info(
        "ImageMatching processing %d images with text: %s...",
        len(prepared_images),
        text[:100],
    )

    try:
        from app.agents.image_text_matching.config_vlm_v2 import VLMConfig
        from app.agents.image_text_matching.utils_vlm_v2 import (
            parse_numeric_response,
            format_image_content,
        )
        from fireworks.client import AsyncFireworks
    except ImportError as e:
        logger.error("Failed to import VLM components: %s", e)
        raise RuntimeError(f"VLM components not available: {e}")

    api_key = VLMConfig.get_api_key()
    matches: list[dict[str, Any]] = []

    async with AsyncFireworks(api_key=api_key) as client:
        for idx, (image_ref, base_payload) in enumerate(prepared_images):
            try:
                logger.info(
                    "Processing image %d/%d: %s",
                    idx + 1,
                    len(prepared_images),
                    image_ref[:80] if len(image_ref) > 80 else image_ref,
                )

                if image_ref.startswith("data:"):
                    try:
                        _, encoded = image_ref.split(",", 1)
                        image_bytes = base64.b64decode(encoded)
                        img = PILImage.open(io.BytesIO(image_bytes))
                    except Exception as e:
                        logger.error("Failed to decode base64 image: %s", e)
                        raise ValueError(f"Invalid base64 image data: {e}")
                elif image_ref.startswith("http://") or image_ref.startswith("https://"):
                    resp = httpx.get(image_ref, timeout=30)
                    resp.raise_for_status()
                    img = PILImage.open(io.BytesIO(resp.content))
                else:
                    raise ValueError(f"Unsupported image source: {image_ref[:50]}...")

                if img.mode != "RGB":
                    img = img.convert("RGB")

                max_dim = 1024
                if img.width > max_dim or img.height > max_dim:
                    ratio = max_dim / max(img.width, img.height)
                    new_size = (int(img.width * ratio), int(img.height * ratio))
                    img = img.resize(new_size, PILImage.Resampling.LANCZOS)

                buffer = io.BytesIO()
                img.save(buffer, format="JPEG", quality=85)
                image_bytes = buffer.getvalue()
                base64_str = base64.b64encode(image_bytes).decode("utf-8")
                image_base64 = f"data:image/jpeg;base64,{base64_str}"

                caption_prompt = (
                    "Describe this image in 1-2 sentences. "
                    "Focus on: main subjects, activities, visible objects, text/graphics, and setting. "
                    "Be concise and factual."
                )
                caption_response = client.chat.completions.create(
                    model=VLMConfig.FIREWORKS_MODEL,
                    messages=[{
                        "role": "user",
                        "content": format_image_content(image_base64, caption_prompt),
                    }],
                    max_tokens=150,
                    temperature=0.3,
                )
                caption = caption_response.choices[0].message.content.strip()

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
                        "content": format_image_content(image_base64, similarity_prompt),
                    }],
                    max_tokens=10,
                    temperature=0.1,
                )
                similarity_text = similarity_response.choices[0].message.content.strip()

                try:
                    similarity_score = parse_numeric_response(similarity_text) / 100.0
                    similarity_score = max(0.0, min(1.0, similarity_score))
                except ValueError:
                    logger.warning("Could not parse similarity score: %s", similarity_text)
                    similarity_score = 0.5

                matches.append(
                    {
                        **base_payload,
                        "image_url": image_ref,
                        "similarity_score": similarity_score,
                        "caption": caption,
                    }
                )
                logger.info("Image %d matched with score %.2f", idx + 1, similarity_score)

            except Exception as e:
                logger.error("Error processing image %d: %s", idx + 1, e)
                matches.append(
                    {
                        **base_payload,
                        "image_url": image_ref,
                        "similarity_score": 0.0,
                        "caption": "",
                        "error": str(e),
                    }
                )

    matches.sort(key=lambda x: x.get("similarity_score", 0), reverse=True)

    match_count_mode = str(params.get("match_count_mode") or "all").strip().lower()
    max_matches_raw = params.get("max_matches")
    if match_count_mode == "manual":
        try:
            max_matches = max(1, min(int(max_matches_raw), 200))
            matches = matches[:max_matches]
        except Exception:
            pass

    logger.info("ImageMatching completed: %d images emitted", len(matches))
    return {"images": matches}


@executor("ImageExtraction")
async def _exec_image_extraction(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Extract keyframes from video.

    Expected inputs:
    - source: VideoRef URL or list[VideoRef URL]

    Fan-in is supported. Multiple source videos are processed in order and
    extracted keyframes are concatenated into one image list.
    """
    import tempfile
    import httpx
    import os
    import asyncio
    from pathlib import Path
    import base64

    source_input = inputs.get("source", "")

    def _extract_video_ref(value: Any) -> str | None:
        if isinstance(value, str):
            candidate = value.strip()
            return candidate or None
        if isinstance(value, dict):
            for key in ("video_url", "url", "src", "data_url"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        return None

    sources: list[str] = []
    for idx, item in enumerate(_as_list(source_input)):
        source_ref = _extract_video_ref(item)
        if source_ref:
            sources.append(source_ref)
            continue
        if item is not None:
            raise ValueError(
                f"Expected source[{idx}] to be a video reference string/object, got {type(item).__name__}"
            )

    if not sources:
        raise ValueError("No video source provided to ImageExtraction node")

    selection_mode = str(params.get("selection_mode") or "auto").strip().lower()
    max_frames_raw = (
        params.get("max_frames")
        if params.get("max_frames") is not None
        else params.get("frame_count")
    )
    max_frames: int | None = None
    if selection_mode == "manual":
        try:
            max_frames = max(1, min(int(max_frames_raw), 200))
        except Exception as exc:
            raise ValueError("ImageExtraction manual mode requires a valid max_frames value") from exc

    from app.agents.image_extraction.keyframe_pipeline import run_keyframe_pipeline

    app_root = Path(__file__).resolve().parent.parent
    output_dir = app_root / "agents" / "image_extraction" / "outputs" / "keyframes"
    output_dir.mkdir(parents=True, exist_ok=True)

    all_image_refs: list[str] = []
    per_source_limits: list[int | None] = [None] * len(sources)
    if max_frames is not None:
        base = max_frames // len(sources)
        remainder = max_frames % len(sources)
        per_source_limits = [
            base + (1 if i < remainder else 0)
            for i in range(len(sources))
        ]

    for source_index, source in enumerate(sources):
        source_limit = per_source_limits[source_index]
        if source_limit is not None and source_limit <= 0:
            continue
        logger.info("ImageExtraction processing video: %s...", source[:80])
        video_path = None
        try:
            if source.startswith("http://") or source.startswith("https://"):
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.get(source)
                    resp.raise_for_status()
                    suffix = os.path.splitext(source.split("?")[0])[-1] or ".mp4"
                    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                        f.write(resp.content)
                        video_path = f.name
            else:
                video_path = source

            config: dict[str, Any] = {"output_dir": str(output_dir)}
            if source_limit is not None:
                config["max_total_frames"] = source_limit
            result = await asyncio.to_thread(run_keyframe_pipeline, video_path, config)

            selected_frames = result.get("selected_frames", [])
            for frame in selected_frames:
                image_path = frame.get("selected_path") or frame.get("frame_path")
                if not image_path or not os.path.exists(image_path):
                    continue

                suffix = Path(image_path).suffix.lower().lstrip(".")
                if suffix in ("jpg", "jpeg"):
                    mime = "image/jpeg"
                elif suffix in ("png", "webp"):
                    mime = f"image/{suffix}"
                else:
                    mime = "image/jpeg"

                with open(image_path, "rb") as img_file:
                    encoded = base64.b64encode(img_file.read()).decode("ascii")
                all_image_refs.append(f"data:{mime};base64,{encoded}")
        finally:
            if video_path and video_path != source and os.path.exists(video_path):
                try:
                    os.unlink(video_path)
                except Exception:
                    pass

    logger.info(
        "ImageExtraction completed: extracted %d keyframes from %d source videos",
        len(all_image_refs),
        len(sources),
    )
    return {"images": all_image_refs}

@executor("QuoteExtraction")
async def _exec_quote_extraction(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Extract curated quotes from input text.

    Expected inputs (after shape conversion in resolve_node_inputs):
    - text: str

    Params:
    - style: "general" | "punchy" | "insightful" | "contrarian" | "emotional" (default: general)
    - count: int (default: 10)
    """
    from app.agents.quote_extraction.extractor import extract_quotes

    text_input = inputs.get("text", "")
    text = text_input if isinstance(text_input, str) else _normalize_text_segment(text_input)
    if not text:
        raise ValueError("No text provided to QuoteExtraction node")

    style = params.get("style") or "general"
    count = params.get("count") or 10
    try:
        count = int(count)
    except Exception:
        count = 10

    quotes = await extract_quotes(transcript=text, style=str(style), count=count)

    quote_lines: list[str] = []
    for quote in quotes:
        if isinstance(quote, dict):
            quote_text = quote.get("text")
            if isinstance(quote_text, str) and quote_text.strip():
                quote_lines.append(quote_text.strip())
        elif isinstance(quote, str) and quote.strip():
            quote_lines.append(quote.strip())

    return {"quotes": "\n\n".join(quote_lines)}


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
                node_type=None,
                status="error",
                error=f"Node {node_id} not found in blueprint",
            )

        exec_fn = _registry.get(bp_node.type)
        if exec_fn is None:
            return NodeExecutionResult(
                node_id=node_id,
                node_type=bp_node.type,
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
                node_type=bp_node.type,
                status="completed",
                outputs=outputs,
                execution_time_ms=elapsed_ms,
            )

        except asyncio.CancelledError:
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)
            return NodeExecutionResult(
                node_id=node_id,
                node_type=bp_node.type,
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
                node_type=bp_node.type,
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
                            node_type=node_map.get(node_id).type if node_map.get(node_id) else None,
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
                node_type=None,
                status="error",
                error=f"Node {node_id} not found in blueprint",
            )

        exec_fn = _registry.get(bp_node.type)
        if exec_fn is None:
            return NodeExecutionResult(
                node_id=node_id,
                node_type=bp_node.type,
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
                node_type=bp_node.type,
                status="completed",
                outputs=outputs,
                execution_time_ms=elapsed_ms,
            )

        except asyncio.CancelledError:
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)
            return NodeExecutionResult(
                node_id=node_id,
                node_type=bp_node.type,
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
                node_type=bp_node.type,
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
                                    node_type=node_map.get(node_id).type if node_map.get(node_id) else None,
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


def _max_persisted_output_bytes() -> int:
    raw = os.getenv("WORKFLOW_OUTPUT_MAX_BYTES", "5000000")
    try:
        parsed = int(raw)
        if parsed <= 0:
            return 5000000
        return parsed
    except ValueError:
        return 5000000


def _persist_run_outputs_enabled() -> bool:
    """
    Runtime switch for run output persistence.

    Default is disabled so workflow execution does not depend on output-persistence writes.
    Set WORKFLOW_PERSIST_RUN_OUTPUTS=1 to re-enable persisted run outputs.
    """
    raw = os.getenv("WORKFLOW_PERSIST_RUN_OUTPUTS", "0").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _serialized_payload_bytes(
    node_outputs: dict[str, Any],
    workflow_outputs: dict[str, Any],
    blueprint_snapshot: dict[str, Any] | None,
) -> int:
    payload = {
        "node_outputs": node_outputs,
        "workflow_outputs": workflow_outputs,
        "blueprint_snapshot": blueprint_snapshot,
    }
    return len(json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8"))


def _build_terminal_node_outputs(
    node_outputs: dict[str, Any],
    blueprint: Blueprint | None,
) -> dict[str, dict[str, Any]]:
    """
    Build a minimized node_outputs map containing only workflow terminal outputs.

    This reduces duplication while preserving enough node-level data for Preview.
    """
    if not blueprint or not blueprint.workflow_outputs:
        return {}

    terminal: dict[str, dict[str, Any]] = {}
    for wf_output in blueprint.workflow_outputs:
        upstream = node_outputs.get(wf_output.from_node)
        if not isinstance(upstream, dict):
            continue
        if wf_output.from_output not in upstream:
            continue
        terminal.setdefault(wf_output.from_node, {})[wf_output.from_output] = upstream[
            wf_output.from_output
        ]
    return terminal


def _trim_list_values(value: Any, max_items: int) -> Any:
    """
    Recursively trim list payloads to reduce persisted run output size.
    """
    if isinstance(value, list):
        return [_trim_list_values(item, max_items) for item in value[:max_items]]
    if isinstance(value, dict):
        return {k: _trim_list_values(v, max_items) for k, v in value.items()}
    return value


def save_execution_log(
    result: WorkflowExecutionResult,
    workflow_id: str | None,
    user_id: str,
    blueprint: Blueprint | None = None,
) -> tuple[str | None, str | None]:
    """
    Persist execution summary and (for saved workflows) per-run outputs.

    Returns:
        (execution_id, persistence_warning)
    """
    node_summaries = [
        {
            "node_id": nr.node_id,
            "node_type": nr.node_type,
            "status": nr.status,
            "error": nr.error,
            "execution_time_ms": nr.execution_time_ms,
        }
        for nr in result.node_results
    ]

    nodes_completed = sum(1 for nr in result.node_results if nr.status == "completed")
    nodes_errored = sum(1 for nr in result.node_results if nr.status == "error")

    execution_row = {
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

    blueprint_snapshot = blueprint.model_dump(mode="json") if blueprint else None
    if blueprint_snapshot:
        execution_row["blueprint"] = blueprint_snapshot

    execution_id: str | None = None
    warning: str | None = None

    try:
        supabase = get_supabase().client
        insert_result = supabase.table("executions").insert(execution_row).execute()
        if not insert_result.data:
            logger.warning(
                "Execution log insert returned no data for workflow %s", workflow_id
            )
            return None, "Execution saved without run outputs due to a logging issue."
        execution_id = str(insert_result.data[0]["id"])
    except Exception as e:
        logger.exception("Failed to save execution log for workflow %s: %s", workflow_id, str(e))
        return None, "Execution completed but could not be saved to history."

    # Persist full outputs only for saved workflows
    if not workflow_id:
        return execution_id, None
    if not _persist_run_outputs_enabled():
        return execution_id, None

    node_outputs = {
        nr.node_id: nr.outputs
        for nr in result.node_results
        if nr.outputs is not None
    }
    persisted_node_outputs = node_outputs
    persisted_workflow_outputs = result.workflow_outputs
    payload_bytes = _serialized_payload_bytes(
        node_outputs=persisted_node_outputs,
        workflow_outputs=persisted_workflow_outputs,
        blueprint_snapshot=blueprint_snapshot,
    )
    max_bytes = _max_persisted_output_bytes()

    if payload_bytes > max_bytes:
        full_payload_bytes = payload_bytes

        terminal_node_outputs = _build_terminal_node_outputs(node_outputs, blueprint)
        terminal_workflow_outputs = result.workflow_outputs
        payload_bytes = _serialized_payload_bytes(
            node_outputs=terminal_node_outputs,
            workflow_outputs=terminal_workflow_outputs,
            blueprint_snapshot=blueprint_snapshot,
        )
        if payload_bytes <= max_bytes:
            persisted_node_outputs = terminal_node_outputs
            persisted_workflow_outputs = terminal_workflow_outputs
            warning = (
                f"Run outputs were too large to persist in full ({full_payload_bytes} bytes exceeds "
                f"limit of {max_bytes} bytes). Persisted terminal outputs only."
            )
        else:
            keyed_workflow_outputs = {key: None for key in result.workflow_outputs.keys()}
            payload_bytes = _serialized_payload_bytes(
                node_outputs=terminal_node_outputs,
                workflow_outputs=keyed_workflow_outputs,
                blueprint_snapshot=blueprint_snapshot,
            )
            if payload_bytes <= max_bytes:
                persisted_node_outputs = terminal_node_outputs
                persisted_workflow_outputs = keyed_workflow_outputs
                warning = (
                    f"Run outputs were too large to persist in full ({full_payload_bytes} bytes exceeds "
                    f"limit of {max_bytes} bytes). Persisted reduced outputs for preview."
                )
            else:
                trimmed_outputs = terminal_node_outputs
                trimmed_payload_bytes = payload_bytes
                for max_items in (12, 8, 5, 3, 2, 1):
                    candidate_node_outputs = _trim_list_values(terminal_node_outputs, max_items)
                    candidate_payload_bytes = _serialized_payload_bytes(
                        node_outputs=candidate_node_outputs,
                        workflow_outputs=keyed_workflow_outputs,
                        blueprint_snapshot=blueprint_snapshot,
                    )
                    if candidate_payload_bytes <= max_bytes:
                        trimmed_outputs = candidate_node_outputs
                        trimmed_payload_bytes = candidate_payload_bytes
                        break
                    trimmed_outputs = candidate_node_outputs
                    trimmed_payload_bytes = candidate_payload_bytes

                if trimmed_payload_bytes <= max_bytes:
                    persisted_node_outputs = trimmed_outputs
                    persisted_workflow_outputs = keyed_workflow_outputs
                    payload_bytes = trimmed_payload_bytes
                    warning = (
                        f"Run outputs were too large to persist in full ({full_payload_bytes} bytes exceeds "
                        f"limit of {max_bytes} bytes). Persisted reduced outputs with trimmed lists."
                    )
                else:
                    warning = (
                        f"Run outputs were too large to persist ({full_payload_bytes} bytes exceeds "
                        f"limit of {max_bytes} bytes)."
                    )
                    return execution_id, warning

    try:
        supabase = get_supabase().client
        supabase.table("workflow_run_outputs").insert(
            {
                "execution_id": execution_id,
                "workflow_id": workflow_id,
                "user_id": user_id,
                "node_outputs": persisted_node_outputs,
                "workflow_outputs": persisted_workflow_outputs,
                "blueprint_snapshot": blueprint_snapshot,
                "payload_bytes": payload_bytes,
            }
        ).execute()
    except Exception as e:
        logger.exception(
            "Failed to save run outputs for workflow %s execution %s: %s",
            workflow_id,
            execution_id,
            str(e),
        )
        warning = "Run completed, but outputs could not be persisted."

    return execution_id, warning
