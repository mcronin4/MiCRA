"""
Workflow execution engine.

Takes a compiled Blueprint, walks the toposorted execution order,
resolves inputs from upstream outputs via connections, dispatches
to the appropriate agent function, and returns all results.

Key concepts:
- Bucket nodes (ImageBucket, AudioBucket, VideoBucket, TextBucket) are source nodes
  that pull files from R2 storage using selected_file_ids from their params.
- Shape conversion (list <-> single) happens automatically based on port specs.
- Execution is sequential in toposort order; first error stops execution.
- Results are logged to the executions table for debugging and history.

V1: Sequential execution, error stops execution, in-memory only.
"""

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


@executor("TextSummarization")
async def _exec_text_summarization(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Summarize text.
    
    Expected inputs (after shape conversion in resolve_node_inputs):
    - text: str (single text string, automatically converted from TextBucket list if needed)
    """
    from app.agents.summarization.summarizer import summarize

    text = inputs.get("text", "")
    
    # Validate input (shape conversion should have already happened)
    if not isinstance(text, str):
        raise ValueError(f"Expected text to be a string (shape conversion should have handled list→single), got {type(text).__name__}")
    
    result = summarize(text)
    return {"summary": result.get("dense_summary", "")}


@executor("Transcription")
async def _exec_transcription(params: dict, inputs: dict) -> dict[str, Any]:
    """
    Transcribe audio/video to text.
    
    Expected inputs (after shape conversion in resolve_node_inputs):
    - audio: str (single AudioRef signed URL, automatically converted from AudioBucket list if needed)
    """
    import tempfile
    import httpx
    import os

    from app.agents.transcription.transcribe import transcribe_audio_or_video_file

    audio = inputs.get("audio", "")
    
    # Validate input (shape conversion should have already happened)
    if not isinstance(audio, str):
        raise ValueError(f"Expected audio to be a string (shape conversion should have handled list→single), got {type(audio).__name__}")

    # If audio is a URL, download to a temp file
    if audio.startswith("http://") or audio.startswith("https://"):
        async with httpx.AsyncClient() as client:
            resp = await client.get(audio)
            resp.raise_for_status()
            suffix = os.path.splitext(audio.split("?")[0])[-1] or ".wav"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                f.write(resp.content)
                audio_path = f.name
    else:
        audio_path = audio

    segments = transcribe_audio_or_video_file(audio_path)

    # Clean up temp file if we downloaded one
    if audio_path != audio and os.path.exists(audio_path):
        os.unlink(audio_path)

    if segments is None:
        raise RuntimeError("Transcription failed")

    joined = " ".join(seg["text"] for seg in segments)
    return {"transcription": joined}


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
            create_async_fireworks_client,
            parse_numeric_response,
            format_image_content
        )
    except ImportError as e:
        logger.error("Failed to import VLM components: %s", e)
        raise RuntimeError(f"VLM components not available: {e}")

    # Initialize Fireworks client
    try:
        api_key = VLMConfig.get_api_key()
        client = create_async_fireworks_client(api_key)
    except Exception as e:
        logger.error("Failed to initialize Fireworks client: %s", e)
        raise RuntimeError(f"Failed to initialize VLM client: {e}")

    matches = []

    for idx, image_url in enumerate(images):
        try:
            logger.info("Processing image %d/%d: %s", idx + 1, len(images), image_url[:80])

            # Download image from signed URL
            resp = httpx.get(image_url, timeout=30)
            resp.raise_for_status()

            # Convert to base64
            img = PILImage.open(io.BytesIO(resp.content))
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
    # Placeholder implementation
    return {"images": []}


# ---------------------------------------------------------------------------
# Main execution function
# ---------------------------------------------------------------------------


async def execute_workflow(
    blueprint: Blueprint,
) -> WorkflowExecutionResult:
    """
    Execute a compiled Blueprint sequentially in toposort order.

    On error in any node, stops execution and returns partial results.
    """
    start_time = time.perf_counter()
    node_outputs: dict[str, dict[str, Any]] = {}
    node_results: list[NodeExecutionResult] = []

    # Build a lookup for blueprint nodes
    node_map = {n.node_id: n for n in blueprint.nodes}

    for node_id in blueprint.execution_order:
        bp_node = node_map.get(node_id)
        if bp_node is None:
            node_results.append(
                NodeExecutionResult(
                    node_id=node_id,
                    status="error",
                    error=f"Node {node_id} not found in blueprint",
                )
            )
            return WorkflowExecutionResult(
                success=False,
                workflow_outputs={},
                node_results=node_results,
                total_execution_time_ms=int(
                    (time.perf_counter() - start_time) * 1000
                ),
                error=f"Node {node_id} not found in blueprint",
            )

        exec_fn = _registry.get(bp_node.type)
        if exec_fn is None:
            node_results.append(
                NodeExecutionResult(
                    node_id=node_id,
                    status="error",
                    error=f"No executor for node type '{bp_node.type}'",
                )
            )
            return WorkflowExecutionResult(
                success=False,
                workflow_outputs={},
                node_results=node_results,
                total_execution_time_ms=int(
                    (time.perf_counter() - start_time) * 1000
                ),
                error=f"No executor for node type '{bp_node.type}'",
            )

        # Resolve inputs
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
                logger.info("ImageMatching node %s resolved inputs: images=%s, text=%s", 
                           node_id,
                           type(resolved_inputs.get("images")),
                           type(resolved_inputs.get("text")))
                if isinstance(resolved_inputs.get("images"), list):
                    logger.info("ImageMatching received %d images", len(resolved_inputs.get("images", [])))
                if resolved_inputs.get("text"):
                    text_val = resolved_inputs.get("text")
                    if isinstance(text_val, str):
                        logger.info("ImageMatching text preview: %s", text_val[:100])
                    elif isinstance(text_val, list):
                        logger.info("ImageMatching text is a list with %d items", len(text_val))

            outputs = await exec_fn(bp_node.params, resolved_inputs)
            node_outputs[node_id] = outputs
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)

            node_results.append(
                NodeExecutionResult(
                    node_id=node_id,
                    status="completed",
                    outputs=outputs,
                    execution_time_ms=elapsed_ms,
                )
            )

        except Exception as e:
            elapsed_ms = int((time.perf_counter() - node_start) * 1000)
            error_msg = f"{type(e).__name__}: {e}"
            logger.exception("Node %s failed: %s", node_id, error_msg)

            node_results.append(
                NodeExecutionResult(
                    node_id=node_id,
                    status="error",
                    error=error_msg,
                    execution_time_ms=elapsed_ms,
                )
            )
            return WorkflowExecutionResult(
                success=False,
                workflow_outputs={},
                node_results=node_results,
                total_execution_time_ms=int(
                    (time.perf_counter() - start_time) * 1000
                ),
                error=f"Execution stopped at node {node_id}: {error_msg}",
            )

    # Extract workflow outputs using the compiled blueprint.workflow_outputs
    # This ensures we only extract outputs that were defined during compilation
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
