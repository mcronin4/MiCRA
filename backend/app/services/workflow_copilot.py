"""
MicrAI workflow copilot planner.

This service accepts a natural-language request and returns a validated workflow
proposal (ReactFlow nodes + edges). It supports both:
- create: build a new workflow from scratch
- edit: modify/extend an existing workflow graph

Planner flow:
1) Try Gemini structured planning for a full workflow graph
2) Fall back to deterministic templates if Gemini output is unavailable/invalid
3) Normalize graph structure and defaults
4) Compile + auto-repair (up to MAX_REPAIR_ATTEMPTS)
5) Return proposal + operation log + touched node IDs
"""

from __future__ import annotations

import copy
import json
import logging
import re
import secrets
from dataclasses import dataclass, field
from typing import Any, Literal

from app.llm.gemini import query_gemini
from app.models.node_registry import NODE_REGISTRY, get_node_spec
from app.services.blueprint_compiler import compile_workflow

logger = logging.getLogger(__name__)


PlanStatus = Literal["ready", "clarify", "error"]
PlanMode = Literal["create", "edit"]
BuildStepKind = Literal["node_intro", "connect", "backtrack"]
RuntimePrimitive = Literal["Text", "ImageRef", "AudioRef", "VideoRef"]

MAX_REPAIR_ATTEMPTS = 2

DEFAULT_NODE_LABELS: dict[str, str] = {
    "ImageBucket": "Image Bucket",
    "AudioBucket": "Audio Bucket",
    "VideoBucket": "Video Bucket",
    "TextBucket": "Text Bucket",
    "TextGeneration": "Text Generation",
    "ImageGeneration": "Image Generation",
    "ImageExtraction": "Image Extraction",
    "ImageMatching": "Image-Text Matching",
    "Transcription": "Transcription",
    "QuoteExtraction": "Quote Extraction",
    "End": "End",
}

SOURCE_NODE_FOR_RUNTIME: dict[str, str] = {
    "Text": "TextBucket",
    "ImageRef": "ImageBucket",
    "AudioRef": "AudioBucket",
    "VideoRef": "VideoBucket",
}

TEXT_PRESET_STOPWORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "be",
    "for",
    "from",
    "i",
    "in",
    "into",
    "is",
    "it",
    "make",
    "my",
    "of",
    "on",
    "post",
    "that",
    "the",
    "this",
    "to",
    "turn",
    "with",
}

STYLE_SIGNAL_KEYWORDS = {
    "controversial",
    "bold",
    "captivating",
    "engaging",
    "compelling",
    "attention-grabbing",
    "attention grabbing",
    "thought-provoking",
    "thought provoking",
    "story-driven",
    "story driven",
    "storytelling",
    "inspiring",
    "authoritative",
    "confident",
    "warm",
    "empathetic",
    "playful",
    "witty",
    "energetic",
    "high-energy",
    "high energy",
    "professional",
    "casual",
    "friendly",
    "funny",
    "humorous",
    "serious",
    "technical",
    "formal",
    "informal",
    "viral",
    "punchy",
    "persuasive",
    "opinionated",
    "tone",
    "voice",
    "style",
    "preset",
}

TONE_STYLE_TERMS = (
    "captivating",
    "engaging",
    "compelling",
    "attention-grabbing",
    "attention grabbing",
    "scroll-stopping",
    "scroll stopping",
    "thought-provoking",
    "thought provoking",
    "provocative",
    "inspiring",
    "story-driven",
    "story driven",
    "storytelling",
    "authoritative",
    "confident",
    "warm",
    "empathetic",
    "playful",
    "witty",
    "energetic",
    "high-energy",
    "high energy",
    "controversial",
    "opinionated",
    "bold",
    "professional",
    "casual",
    "friendly",
    "funny",
    "humorous",
    "serious",
    "technical",
    "formal",
    "informal",
    "viral",
    "punchy",
    "persuasive",
)

PresetVariant = Literal["summary", "action_items"]

TARGET_CHANNEL_TO_END_OUTPUT_KEY: dict[str, str] = {
    "linkedin": "linkedin_post",
    "x": "x_post",
    "email": "email",
}

DEFAULT_TEXT_TONE_BY_CHANNEL: dict[str, str] = {
    "linkedin": "Professional, insightful, and conversational",
    "x": "Concise, engaging, and punchy",
    "email": "Clear, helpful, and professional",
    "tiktok": "Short, energetic, and attention-grabbing",
}

DEFAULT_TEXT_MAX_LENGTH_BY_CHANNEL: dict[str, int] = {
    "x": 280,
    "linkedin": 1200,
    "email": 1800,
    "tiktok": 300,
}

DEFAULT_TEXT_STRUCTURE_BY_CHANNEL: dict[str, str] = {
    "x": "Hook, core value, optional CTA",
    "linkedin": "Hook, insight, takeaway, optional CTA",
    "email": "Subject line, opener, key points, CTA",
    "tiktok": "Hook, core message, CTA",
}


@dataclass
class CopilotPlanResult:
    status: PlanStatus
    summary: str
    workflow_data: dict[str, Any] | None = None
    operations: list[dict[str, Any]] = field(default_factory=list)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)
    auto_repair_attempts: int = 0
    touched_node_ids: list[str] = field(default_factory=list)
    build_steps: list[dict[str, Any]] = field(default_factory=list)
    closing_narration: str | None = None
    requires_replace_confirmation: bool = False
    clarification_question: str | None = None

    def model_dump(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "summary": self.summary,
            "workflow_data": self.workflow_data,
            "operations": self.operations,
            "diagnostics": self.diagnostics,
            "auto_repair_attempts": self.auto_repair_attempts,
            "touched_node_ids": self.touched_node_ids,
            "build_steps": self.build_steps,
            "closing_narration": self.closing_narration,
            "requires_replace_confirmation": self.requires_replace_confirmation,
            "clarification_question": self.clarification_question,
        }


def plan_workflow_with_copilot(
    *,
    message: str,
    mode: PlanMode,
    workflow_data: dict[str, Any] | None,
    user_id: str,
    supabase_client: Any,
    preferences: dict[str, Any] | None = None,
) -> CopilotPlanResult:
    prompt = (message or "").strip()
    if not prompt:
        return CopilotPlanResult(
            status="clarify",
            summary="Need more detail to build or edit the workflow.",
            clarification_question=(
                "What should MicrAI build? Example: "
                "'turn a video into a LinkedIn post with matched images'."
            ),
        )

    normalized_mode: PlanMode = "create" if mode == "create" else "edit"
    current_workflow = _normalize_workflow_data(
        workflow_data or {"nodes": [], "edges": []}
    )
    base_workflow = (
        {"nodes": [], "edges": []}
        if normalized_mode == "create"
        else copy.deepcopy(current_workflow)
    )

    text_settings = _resolve_text_generation_settings(
        supabase_client=supabase_client,
        user_id=user_id,
        request_text=prompt,
    )
    preset_id = text_settings.get("preset_id")
    preset_variant = text_settings.get("preset_variant")
    text_overrides = text_settings.get("text_overrides") or {}
    force_text_settings = (
        normalized_mode == "create"
        or bool(text_settings.get("explicit_preset_request"))
        or bool(text_settings.get("text_overrides"))
    )
    target_channel = _infer_target_channel(prompt)
    end_output_key = _resolve_end_output_key(
        request_text=prompt,
        target_channel_hint=target_channel,
    )

    planned = _plan_with_gemini(
        mode=normalized_mode,
        prompt=prompt,
        current_workflow=base_workflow,
        preset_id=preset_id,
        preset_variant=preset_variant,
        text_overrides=text_overrides,
        target_channel=target_channel,
        end_output_key=end_output_key,
    )
    if planned is None:
        planned = _plan_with_fallback(
            mode=normalized_mode,
            prompt=prompt,
            current_workflow=base_workflow,
            preset_id=preset_id,
            target_channel=target_channel,
        )

    planned = _normalize_workflow_data(planned)
    _apply_node_defaults_and_params(
        planned,
        preset_id=preset_id,
        preset_variant=preset_variant,
        text_overrides=text_overrides,
        force_text_settings=force_text_settings,
    )
    _repair_edge_handles(planned)
    _ensure_output_visual_connections_to_end(planned)
    _apply_end_output_key_selection(planned, end_output_key=end_output_key)

    needs_text_preset = any(
        node.get("type") == "TextGeneration"
        and not str((node.get("data") or {}).get("preset_id") or "").strip()
        for node in planned["nodes"]
    )
    if needs_text_preset:
        return CopilotPlanResult(
            status="clarify",
            summary="MicrAI needs a Text Generation preset before applying this plan.",
            workflow_data=planned,
            clarification_question=(
                "Create/select a Text Generation preset, then retry MicrAI planning."
            ),
            requires_replace_confirmation=(
                normalized_mode == "create" and len(current_workflow["nodes"]) > 0
            ),
        )

    compile_result = compile_workflow(
        nodes=planned["nodes"],
        edges=planned["edges"],
        name="MicrAI Planned Workflow",
        created_by=user_id,
    )
    repair_attempts = 0

    while (
        not compile_result.success
        and repair_attempts < MAX_REPAIR_ATTEMPTS
    ):
        repair_attempts += 1
        _auto_repair_graph(planned, compile_result.diagnostics)
        _apply_node_defaults_and_params(
            planned,
            preset_id=preset_id,
            preset_variant=preset_variant,
            text_overrides=text_overrides,
            force_text_settings=force_text_settings,
        )
        _repair_edge_handles(planned)
        _ensure_output_visual_connections_to_end(planned)
        _apply_end_output_key_selection(planned, end_output_key=end_output_key)
        compile_result = compile_workflow(
            nodes=planned["nodes"],
            edges=planned["edges"],
            name="MicrAI Planned Workflow",
            created_by=user_id,
        )

    diagnostics = [d.model_dump() for d in compile_result.diagnostics]

    if not compile_result.success:
        return CopilotPlanResult(
            status="error",
            summary="MicrAI could not produce a valid workflow plan.",
            workflow_data=planned,
            diagnostics=diagnostics,
            auto_repair_attempts=repair_attempts,
            touched_node_ids=[],
            operations=[],
            requires_replace_confirmation=(
                normalized_mode == "create" and len(current_workflow["nodes"]) > 0
            ),
        )

    operations, touched_node_ids = _compute_operations_and_touched_nodes(
        before=current_workflow,
        after=planned,
    )
    try:
        build_steps = _build_guided_build_steps(
            before=current_workflow,
            after=planned,
            mode=normalized_mode,
            operations=operations,
            touched_node_ids=touched_node_ids,
            request_text=prompt,
        )
    except Exception:
        build_steps = []
    closing_narration = _generate_closing_narration_with_gemini(
        request_text=prompt,
        node_count=len(planned["nodes"]),
        edge_count=len(planned["edges"]),
    )

    summary = _build_plan_summary(
        mode=normalized_mode,
        prompt=prompt,
        node_count=len(planned["nodes"]),
        edge_count=len(planned["edges"]),
        target_channel=target_channel,
    )

    if preferences:
        _ = preferences

    return CopilotPlanResult(
        status="ready",
        summary=summary,
        workflow_data=planned,
        operations=operations,
        diagnostics=diagnostics,
        auto_repair_attempts=repair_attempts,
        touched_node_ids=touched_node_ids,
        build_steps=build_steps,
        closing_narration=closing_narration,
        requires_replace_confirmation=(
            normalized_mode == "create" and len(current_workflow["nodes"]) > 0
        ),
    )


def _plan_with_gemini(
    *,
    mode: PlanMode,
    prompt: str,
    current_workflow: dict[str, Any],
    preset_id: str | None,
    preset_variant: PresetVariant | None,
    text_overrides: dict[str, Any],
    target_channel: str | None,
    end_output_key: str | None,
) -> dict[str, Any] | None:
    node_specs = []
    for node_type, spec in NODE_REGISTRY.items():
        node_specs.append(
            {
                "type": node_type,
                "inputs": [
                    {
                        "key": p.key,
                        "runtime_type": p.runtime_type,
                        "shape": p.shape,
                        "required": p.required,
                    }
                    for p in spec.inputs
                ],
                "outputs": [
                    {
                        "key": p.key,
                        "runtime_type": p.runtime_type,
                        "shape": p.shape,
                    }
                    for p in spec.outputs
                ],
            }
        )

    schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "workflow_data": {
                "type": "object",
                "properties": {
                    "nodes": {"type": "array"},
                    "edges": {"type": "array"},
                },
                "required": ["nodes", "edges"],
            },
        },
        "required": ["workflow_data"],
    }

    instructions = f"""
You are MicrAI workflow planner.
Return ONLY JSON matching the schema.

Rules:
- Use only these node types and ports: {json.dumps(node_specs)}
- Output workflow_data with full nodes+edges after planning.
- Keep node ids stable for existing nodes when editing.
- Use primitives only (Text, ImageRef, AudioRef, VideoRef).
- End node accepts any primitive input but its input handle key is "end-input".
- If preferred End output key is provided, set End node data.output_key to it.
- Connect visible outputs into End for UX consistency:
  * TextGeneration.generated_text -> End.end-input
  * ImageMatching.images -> End.end-input
  when those nodes are present.
- TextGeneration nodes must include data.preset_id when available.
- TextGeneration runtime overrides are applied by MicrAI post-processing,
  so planner output may omit:
  * data.tone_guidance_override
  * data.max_length_override
  * data.structure_template_override
  * data.prompt_template_override
  * data.output_format_override
- Remove legacy output nodes (LinkedIn/TikTok/Email). End node is terminal.
- Ensure required inputs are connected.
- For create mode, produce a complete runnable graph.
- For edit mode, preserve existing structure unless prompt asks to change.

Context:
- mode: {mode}
- requested channel hint: {target_channel or "none"}
- preferred preset_id: {preset_id or "none"}
- preferred preset_variant: {preset_variant or "none"}
- preferred text overrides: {json.dumps(text_overrides)}
- preferred End output_key: {end_output_key or "none"}
- current workflow: {json.dumps(current_workflow)}
- user request: {prompt}
"""

    try:
        resp = query_gemini(
            instructions,
            response_schema=schema,
            response_mime_type="application/json",
        )
        if not isinstance(resp, dict):
            return None
        wf = resp.get("workflow_data")
        if not isinstance(wf, dict):
            return None
        return wf
    except Exception:
        return None


def _plan_with_fallback(
    *,
    mode: PlanMode,
    prompt: str,
    current_workflow: dict[str, Any],
    preset_id: str | None,
    target_channel: str | None,
) -> dict[str, Any]:
    if mode == "edit" and current_workflow.get("nodes"):
        return _fallback_edit(
            prompt=prompt,
            current_workflow=current_workflow,
            preset_id=preset_id,
            target_channel=target_channel,
        )
    return _fallback_create(prompt=prompt, preset_id=preset_id, target_channel=target_channel)


def _fallback_create(
    *,
    prompt: str,
    preset_id: str | None,
    target_channel: str | None,
) -> dict[str, Any]:
    lower = prompt.lower()
    if "video" in lower and ("linkedin" in lower or target_channel == "linkedin"):
        return _template_video_to_linkedin(preset_id=preset_id)
    if "video" in lower:
        return _template_video_to_text(preset_id=preset_id)
    if "audio" in lower or "transcrib" in lower:
        return _template_audio_to_text(preset_id=preset_id)
    if "image" in lower and "match" in lower:
        return _template_image_text_match(preset_id=preset_id)
    return _template_text_to_end(preset_id=preset_id)


def _fallback_edit(
    *,
    prompt: str,
    current_workflow: dict[str, Any],
    preset_id: str | None,
    target_channel: str | None,
) -> dict[str, Any]:
    _ = target_channel
    workflow = copy.deepcopy(current_workflow)
    lower = prompt.lower()
    node_index = _node_index(workflow["nodes"])
    edge_tuples = {
        (
            e["source"],
            e.get("sourceHandle"),
            e["target"],
            e.get("targetHandle"),
        )
        for e in workflow["edges"]
    }

    wants_matching = (
        "image matching" in lower
        or "image-text matching" in lower
        or "match images" in lower
    )

    if wants_matching and "ImageMatching" not in node_index:
        image_matching_id = _add_node(
            workflow,
            node_type="ImageMatching",
            x=860,
            y=220,
            data={"match_count_mode": "all", "max_matches": 5},
        )

        text_gen_id = _find_first_node_id(workflow, "TextGeneration")
        image_extract_id = _find_first_node_id(workflow, "ImageExtraction")
        video_bucket_id = _find_first_node_id(workflow, "VideoBucket")

        if image_extract_id:
            _add_edge_if_missing(
                workflow,
                edge_tuples=edge_tuples,
                source=image_extract_id,
                source_handle="images",
                target=image_matching_id,
                target_handle="images",
            )
        elif video_bucket_id:
            image_extract_id = _add_node(
                workflow,
                node_type="ImageExtraction",
                x=560,
                y=140,
                data={"selection_mode": "auto", "max_frames": 10},
            )
            _add_edge_if_missing(
                workflow,
                edge_tuples=edge_tuples,
                source=video_bucket_id,
                source_handle="videos",
                target=image_extract_id,
                target_handle="source",
            )
            _add_edge_if_missing(
                workflow,
                edge_tuples=edge_tuples,
                source=image_extract_id,
                source_handle="images",
                target=image_matching_id,
                target_handle="images",
            )

        if text_gen_id:
            _add_edge_if_missing(
                workflow,
                edge_tuples=edge_tuples,
                source=text_gen_id,
                source_handle="generated_text",
                target=image_matching_id,
                target_handle="text",
            )

        end_id = _find_first_node_id(workflow, "End")
        if not end_id:
            end_id = _add_node(workflow, node_type="End", x=1160, y=220)
        _add_edge_if_missing(
            workflow,
            edge_tuples=edge_tuples,
            source=image_matching_id,
            source_handle="images",
            target=end_id,
            target_handle="end-input",
        )

    if "end" in lower and not _find_first_node_id(workflow, "End"):
        _add_node(workflow, node_type="End", x=1160, y=240)

    return workflow


def _template_video_to_linkedin(*, preset_id: str | None) -> dict[str, Any]:
    wf = {"nodes": [], "edges": []}
    v = _add_node(wf, "VideoBucket", 120, 220)
    t = _add_node(wf, "Transcription", 420, 360)
    tg = _add_node(
        wf,
        "TextGeneration",
        720,
        360,
        data={"preset_id": preset_id} if preset_id else {},
    )
    ie = _add_node(
        wf,
        "ImageExtraction",
        420,
        120,
        data={"selection_mode": "auto", "max_frames": 10},
    )
    im = _add_node(
        wf,
        "ImageMatching",
        1020,
        220,
        data={"match_count_mode": "all", "max_matches": 5},
    )
    e = _add_node(wf, "End", 1320, 220)

    _add_edge(wf, v, "videos", t, "video")
    _add_edge(wf, t, "transcription", tg, "text")
    _add_edge(wf, v, "videos", ie, "source")
    _add_edge(wf, ie, "images", im, "images")
    _add_edge(wf, tg, "generated_text", im, "text")
    _add_edge(wf, tg, "generated_text", e, "end-input")
    _add_edge(wf, im, "images", e, "end-input")
    return wf


def _template_video_to_text(*, preset_id: str | None) -> dict[str, Any]:
    wf = {"nodes": [], "edges": []}
    v = _add_node(wf, "VideoBucket", 140, 220)
    t = _add_node(wf, "Transcription", 440, 220)
    tg = _add_node(
        wf,
        "TextGeneration",
        740,
        220,
        data={"preset_id": preset_id} if preset_id else {},
    )
    e = _add_node(wf, "End", 1040, 220)
    _add_edge(wf, v, "videos", t, "video")
    _add_edge(wf, t, "transcription", tg, "text")
    _add_edge(wf, tg, "generated_text", e, "end-input")
    return wf


def _template_audio_to_text(*, preset_id: str | None) -> dict[str, Any]:
    wf = {"nodes": [], "edges": []}
    a = _add_node(wf, "AudioBucket", 140, 220)
    t = _add_node(wf, "Transcription", 440, 220)
    tg = _add_node(
        wf,
        "TextGeneration",
        740,
        220,
        data={"preset_id": preset_id} if preset_id else {},
    )
    e = _add_node(wf, "End", 1040, 220)
    _add_edge(wf, a, "audio", t, "audio")
    _add_edge(wf, t, "transcription", tg, "text")
    _add_edge(wf, tg, "generated_text", e, "end-input")
    return wf


def _template_image_text_match(*, preset_id: str | None) -> dict[str, Any]:
    wf = {"nodes": [], "edges": []}
    i = _add_node(wf, "ImageBucket", 140, 140)
    tb = _add_node(wf, "TextBucket", 140, 320)
    tg = _add_node(
        wf,
        "TextGeneration",
        460,
        320,
        data={"preset_id": preset_id} if preset_id else {},
    )
    im = _add_node(
        wf,
        "ImageMatching",
        760,
        220,
        data={"match_count_mode": "all", "max_matches": 5},
    )
    e = _add_node(wf, "End", 1060, 220)
    _add_edge(wf, i, "images", im, "images")
    _add_edge(wf, tb, "text", tg, "text")
    _add_edge(wf, tg, "generated_text", im, "text")
    _add_edge(wf, im, "images", e, "end-input")
    return wf


def _template_text_to_end(*, preset_id: str | None) -> dict[str, Any]:
    wf = {"nodes": [], "edges": []}
    tb = _add_node(wf, "TextBucket", 180, 220)
    tg = _add_node(
        wf,
        "TextGeneration",
        520,
        220,
        data={"preset_id": preset_id} if preset_id else {},
    )
    e = _add_node(wf, "End", 860, 220)
    _add_edge(wf, tb, "text", tg, "text")
    _add_edge(wf, tg, "generated_text", e, "end-input")
    return wf


def _auto_repair_graph(
    workflow: dict[str, Any],
    diagnostics: list[Any],
) -> None:
    _remove_dangling_or_invalid_edges(workflow)
    _remove_incoming_edges_to_bucket_nodes(workflow)
    _repair_edge_handles(workflow)
    _connect_missing_required_inputs(workflow)
    _ensure_end_node_has_input(workflow)
    _ensure_output_visual_connections_to_end(workflow)
    _ensure_non_empty(workflow)

    if diagnostics:
        messages = " | ".join(
            getattr(d, "message", "") if not isinstance(d, dict) else d.get("message", "")
            for d in diagnostics
        )
        if "Workflow must contain at least one node" in messages:
            _ensure_non_empty(workflow)


def _normalize_workflow_data(workflow_data: dict[str, Any]) -> dict[str, Any]:
    nodes_raw = workflow_data.get("nodes", []) if isinstance(workflow_data, dict) else []
    edges_raw = workflow_data.get("edges", []) if isinstance(workflow_data, dict) else []

    nodes: list[dict[str, Any]] = []
    for node in nodes_raw if isinstance(nodes_raw, list) else []:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type") or "").strip()
        node_id = str(node.get("id") or "").strip()
        if not node_type or not node_id:
            continue
        if node_type not in NODE_REGISTRY:
            continue
        pos = node.get("position") if isinstance(node.get("position"), dict) else {}
        x = pos.get("x", 0)
        y = pos.get("y", 0)
        try:
            x_f = float(x)
            y_f = float(y)
        except Exception:
            x_f = 0.0
            y_f = 0.0
        data = node.get("data")
        if not isinstance(data, dict):
            data = {}
        nodes.append(
            {
                "id": node_id,
                "type": node_type,
                "position": {"x": x_f, "y": y_f},
                "data": copy.deepcopy(data),
            }
        )

    nodes = _dedupe_nodes(nodes)
    node_ids = {n["id"] for n in nodes}

    edges: list[dict[str, Any]] = []
    for edge in edges_raw if isinstance(edges_raw, list) else []:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if not source or not target:
            continue
        if source not in node_ids or target not in node_ids:
            continue
        source_handle = edge.get("sourceHandle")
        target_handle = edge.get("targetHandle")
        edge_id = str(edge.get("id") or "").strip()
        if not edge_id:
            edge_id = f"edge-{source}-{source_handle or 'out'}-{target}-{target_handle or 'in'}"
        edges.append(
            {
                "id": edge_id,
                "source": source,
                "target": target,
                "sourceHandle": source_handle if isinstance(source_handle, str) else None,
                "targetHandle": target_handle if isinstance(target_handle, str) else None,
            }
        )

    deduped_edges = []
    seen_edge_keys = set()
    for edge in edges:
        key = (
            edge["source"],
            edge.get("sourceHandle"),
            edge["target"],
            edge.get("targetHandle"),
        )
        if key in seen_edge_keys:
            continue
        seen_edge_keys.add(key)
        deduped_edges.append(edge)

    return {"nodes": nodes, "edges": deduped_edges}


def _dedupe_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen = set()
    for node in nodes:
        node_id = node["id"]
        if node_id in seen:
            continue
        seen.add(node_id)
        out.append(node)
    return out


def _apply_node_defaults_and_params(
    workflow: dict[str, Any],
    *,
    preset_id: str | None,
    preset_variant: PresetVariant | None,
    text_overrides: dict[str, Any] | None = None,
    force_text_settings: bool = False,
) -> None:
    overrides = text_overrides or {}
    for node in workflow["nodes"]:
        node_type = node["type"]
        spec = get_node_spec(node_type)
        if spec is None:
            continue
        data = node.setdefault("data", {})
        if "label" not in data:
            data["label"] = DEFAULT_NODE_LABELS.get(node_type, node_type)
        for key, value in spec.default_params.items():
            data.setdefault(key, value)
        if node_type == "TextGeneration" and preset_id:
            if force_text_settings:
                data["preset_id"] = preset_id
            else:
                data.setdefault("preset_id", preset_id)
        if node_type == "TextGeneration" and preset_variant:
            if force_text_settings:
                data["preset_variant"] = preset_variant
            else:
                data.setdefault("preset_variant", preset_variant)
        if node_type == "TextGeneration":
            for key in (
                "tone_guidance_override",
                "max_length_override",
                "structure_template_override",
                "prompt_template_override",
                "output_format_override",
            ):
                if key not in overrides:
                    continue
                value = overrides.get(key)
                if value is None:
                    continue
                if force_text_settings:
                    data[key] = value
                else:
                    data.setdefault(key, value)


def _repair_edge_handles(workflow: dict[str, Any]) -> None:
    node_by_id = {node["id"]: node for node in workflow["nodes"]}
    for edge in workflow["edges"]:
        src = node_by_id.get(edge["source"])
        tgt = node_by_id.get(edge["target"])
        if not src or not tgt:
            continue
        src_spec = get_node_spec(src["type"])
        tgt_spec = get_node_spec(tgt["type"])
        if src_spec and src_spec.outputs:
            valid = {p.key for p in src_spec.outputs}
            if edge.get("sourceHandle") not in valid:
                edge["sourceHandle"] = src_spec.outputs[0].key
        if tgt_spec and tgt_spec.inputs:
            valid = {p.key for p in tgt_spec.inputs}
            if edge.get("targetHandle") not in valid:
                edge["targetHandle"] = tgt_spec.inputs[0].key

    _remove_dangling_or_invalid_edges(workflow)


def _remove_dangling_or_invalid_edges(workflow: dict[str, Any]) -> None:
    node_by_id = {node["id"]: node for node in workflow["nodes"]}
    kept: list[dict[str, Any]] = []
    seen = set()
    for edge in workflow["edges"]:
        src = node_by_id.get(edge["source"])
        tgt = node_by_id.get(edge["target"])
        if not src or not tgt:
            continue
        src_spec = get_node_spec(src["type"])
        tgt_spec = get_node_spec(tgt["type"])
        src_handle = edge.get("sourceHandle")
        tgt_handle = edge.get("targetHandle")
        if src_spec:
            if src_handle not in {p.key for p in src_spec.outputs}:
                continue
        if tgt_spec:
            if tgt_handle not in {p.key for p in tgt_spec.inputs}:
                continue
        key = (edge["source"], src_handle, edge["target"], tgt_handle)
        if key in seen:
            continue
        seen.add(key)
        kept.append(edge)
    workflow["edges"] = kept


def _remove_incoming_edges_to_bucket_nodes(workflow: dict[str, Any]) -> None:
    bucket_ids = {
        node["id"]
        for node in workflow["nodes"]
        if node["type"] in {"ImageBucket", "AudioBucket", "VideoBucket", "TextBucket"}
    }
    workflow["edges"] = [e for e in workflow["edges"] if e["target"] not in bucket_ids]


def _connect_missing_required_inputs(workflow: dict[str, Any]) -> None:
    incoming_by_target_input: set[tuple[str, str | None]] = set(
        (edge["target"], edge.get("targetHandle")) for edge in workflow["edges"]
    )

    for node in list(workflow["nodes"]):
        spec = get_node_spec(node["type"])
        if not spec:
            continue

        for input_port in spec.inputs:
            if not input_port.required:
                continue
            key = (node["id"], input_port.key)
            if key in incoming_by_target_input:
                continue

            source = _find_compatible_source(
                workflow=workflow,
                target_node_id=node["id"],
                target_port_key=input_port.key,
            )
            if source is None:
                src_node_type = SOURCE_NODE_FOR_RUNTIME.get(input_port.runtime_type)
                if src_node_type:
                    src_id = _add_node(
                        workflow,
                        node_type=src_node_type,
                        x=node["position"]["x"] - 320,
                        y=node["position"]["y"],
                    )
                    source_spec = get_node_spec(src_node_type)
                    if source_spec and source_spec.outputs:
                        source = (src_id, source_spec.outputs[0].key)

            if source is None:
                continue

            source_node_id, source_handle = source
            _add_edge(
                workflow,
                source=source_node_id,
                source_handle=source_handle,
                target=node["id"],
                target_handle=input_port.key,
            )
            incoming_by_target_input.add((node["id"], input_port.key))

    _remove_dangling_or_invalid_edges(workflow)


def _find_compatible_source(
    *,
    workflow: dict[str, Any],
    target_node_id: str,
    target_port_key: str,
) -> tuple[str, str] | None:
    node_by_id = {node["id"]: node for node in workflow["nodes"]}
    tgt = node_by_id.get(target_node_id)
    if not tgt:
        return None
    tgt_spec = get_node_spec(tgt["type"])
    if not tgt_spec:
        return None
    tgt_port = next((p for p in tgt_spec.inputs if p.key == target_port_key), None)
    if not tgt_port:
        return None

    target_x = float(tgt["position"].get("x", 0))
    candidates: list[tuple[float, str, str]] = []

    for node in workflow["nodes"]:
        if node["id"] == target_node_id:
            continue
        spec = get_node_spec(node["type"])
        if not spec:
            continue
        source_x = float(node["position"].get("x", 0))
        for output in spec.outputs:
            if not _runtime_types_compatible(
                src_runtime=output.runtime_type,
                tgt_runtime=tgt_port.runtime_type,
            ):
                continue
            distance = abs(target_x - source_x)
            candidates.append((distance, node["id"], output.key))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    _, node_id, handle = candidates[0]
    return (node_id, handle)


def _runtime_types_compatible(*, src_runtime: str, tgt_runtime: str) -> bool:
    if src_runtime == tgt_runtime:
        return True
    if src_runtime == "VideoRef" and tgt_runtime == "AudioRef":
        return True
    return False


def _ensure_end_node_has_input(workflow: dict[str, Any]) -> None:
    end_node_id = _find_first_node_id(workflow, "End")
    if end_node_id is None:
        end_node_id = _add_node(workflow, "End", 1200, 220)

    has_end_input = any(
        edge["target"] == end_node_id and edge.get("targetHandle") == "end-input"
        for edge in workflow["edges"]
    )
    if has_end_input:
        return

    preferred_types = [
        "TextGeneration",
        "QuoteExtraction",
        "Transcription",
        "ImageMatching",
        "ImageGeneration",
        "ImageExtraction",
    ]
    src_id = None
    src_handle = None
    for node_type in preferred_types:
        node_id = _find_first_node_id(workflow, node_type)
        if not node_id:
            continue
        spec = get_node_spec(node_type)
        if not spec or not spec.outputs:
            continue
        src_id = node_id
        src_handle = spec.outputs[0].key
        break

    if not src_id:
        for node in workflow["nodes"]:
            if node["id"] == end_node_id:
                continue
            spec = get_node_spec(node["type"])
            if spec and spec.outputs:
                src_id = node["id"]
                src_handle = spec.outputs[0].key
                break

    if src_id and src_handle:
        _add_edge(workflow, src_id, src_handle, end_node_id, "end-input")


def _ensure_output_visual_connections_to_end(workflow: dict[str, Any]) -> None:
    """
    UX rule: visible output-carrying nodes should also connect to End so users can
    clearly see what contributes to final output selection.
    """
    end_node_id = _find_first_node_id(workflow, "End")
    if end_node_id is None:
        end_node_id = _add_node(workflow, "End", 1200, 220)

    preferred_output_ports = {
        "TextGeneration": "generated_text",
        "ImageMatching": "images",
    }

    node_by_id = {node["id"]: node for node in workflow["nodes"]}
    for node in workflow["nodes"]:
        node_type = node.get("type")
        if node_type not in preferred_output_ports:
            continue
        source_handle = preferred_output_ports[node_type]
        spec = get_node_spec(node_type)
        if not spec:
            continue
        valid_handles = {p.key for p in spec.outputs}
        if source_handle not in valid_handles:
            continue
        _add_edge(
            workflow,
            source=node["id"],
            source_handle=source_handle,
            target=end_node_id,
            target_handle="end-input",
        )

    # Also connect terminal producer nodes as a fallback (non-bucket, non-End).
    outgoing_by_source = {}
    for edge in workflow["edges"]:
        outgoing_by_source.setdefault(edge["source"], 0)
        outgoing_by_source[edge["source"]] += 1

    skip_types = {"ImageBucket", "AudioBucket", "VideoBucket", "TextBucket", "End"}
    for node in workflow["nodes"]:
        node_type = node.get("type", "")
        if node_type in skip_types:
            continue
        spec = get_node_spec(node_type)
        if not spec or not spec.outputs:
            continue
        if outgoing_by_source.get(node["id"], 0) > 0:
            continue
        first_handle = spec.outputs[0].key
        _add_edge(
            workflow,
            source=node["id"],
            source_handle=first_handle,
            target=end_node_id,
            target_handle="end-input",
        )


def _apply_end_output_key_selection(
    workflow: dict[str, Any],
    *,
    end_output_key: str | None,
) -> None:
    chosen = str(end_output_key or "").strip()
    if not chosen:
        return
    for node in workflow.get("nodes", []):
        if node.get("type") != "End":
            continue
        data = node.setdefault("data", {})
        data["output_key"] = chosen


def _ensure_non_empty(workflow: dict[str, Any]) -> None:
    if workflow["nodes"]:
        return
    _add_node(workflow, "TextBucket", 180, 220)
    _add_node(workflow, "TextGeneration", 520, 220)
    _add_node(workflow, "End", 860, 220)
    _add_edge(
        workflow,
        source=workflow["nodes"][0]["id"],
        source_handle="text",
        target=workflow["nodes"][1]["id"],
        target_handle="text",
    )
    _add_edge(
        workflow,
        source=workflow["nodes"][1]["id"],
        source_handle="generated_text",
        target=workflow["nodes"][2]["id"],
        target_handle="end-input",
    )


def _build_plan_summary(
    *,
    mode: PlanMode,
    prompt: str,
    node_count: int,
    edge_count: int,
    target_channel: str | None,
) -> str:
    _ = prompt
    verb = "Built" if mode == "create" else "Updated"
    channel_note = f" for {target_channel}" if target_channel else ""
    return f"{verb} workflow{channel_note}: {node_count} nodes, {edge_count} connections."


def _compute_operations_and_touched_nodes(
    *,
    before: dict[str, Any],
    after: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    before_nodes = {n["id"]: n for n in before.get("nodes", [])}
    after_nodes = {n["id"]: n for n in after.get("nodes", [])}

    operations: list[dict[str, Any]] = []
    touched: set[str] = set()

    for node_id, node in after_nodes.items():
        if node_id not in before_nodes:
            operations.append({"op": "add_node", "node_id": node_id, "node_type": node["type"]})
            touched.add(node_id)
        else:
            old = before_nodes[node_id]
            if (
                old.get("type") != node.get("type")
                or old.get("data") != node.get("data")
                or old.get("position") != node.get("position")
            ):
                operations.append({"op": "update_node", "node_id": node_id, "node_type": node["type"]})
                touched.add(node_id)

    for node_id, node in before_nodes.items():
        if node_id not in after_nodes:
            operations.append({"op": "remove_node", "node_id": node_id, "node_type": node["type"]})
            touched.add(node_id)

    before_edges = {
        (
            e["source"],
            e.get("sourceHandle"),
            e["target"],
            e.get("targetHandle"),
        )
        for e in before.get("edges", [])
    }
    after_edges = {
        (
            e["source"],
            e.get("sourceHandle"),
            e["target"],
            e.get("targetHandle"),
        )
        for e in after.get("edges", [])
    }

    for edge in after_edges - before_edges:
        source, source_handle, target, target_handle = edge
        operations.append(
            {
                "op": "add_edge",
                "source": source,
                "source_handle": source_handle,
                "target": target,
                "target_handle": target_handle,
            }
        )
        touched.add(source)
        touched.add(target)

    for edge in before_edges - after_edges:
        source, source_handle, target, target_handle = edge
        operations.append(
            {
                "op": "remove_edge",
                "source": source,
                "source_handle": source_handle,
                "target": target,
                "target_handle": target_handle,
            }
        )
        touched.add(source)
        touched.add(target)

    return operations, sorted(touched)


def _build_guided_build_steps(
    *,
    before: dict[str, Any],
    after: dict[str, Any],
    mode: PlanMode,
    operations: list[dict[str, Any]],
    touched_node_ids: list[str],
    request_text: str,
) -> list[dict[str, Any]]:
    before_nodes_by_id = {node["id"]: node for node in before.get("nodes", [])}
    after_nodes_by_id = {node["id"]: node for node in after.get("nodes", [])}
    after_edges = [edge for edge in after.get("edges", []) if isinstance(edge, dict)]
    if not after_nodes_by_id:
        return []

    before_node_ids = set(before_nodes_by_id.keys())
    after_node_ids = set(after_nodes_by_id.keys())

    if mode == "create":
        animated_node_ids = set(after_node_ids)
    else:
        changed_node_ids = {
            str(op.get("node_id") or "")
            for op in operations
            if op.get("op") in {"add_node", "update_node"}
        }
        changed_node_ids = {
            node_id
            for node_id in changed_node_ids
            if node_id and node_id in after_node_ids
        }
        touched_after = {node_id for node_id in touched_node_ids if node_id in after_node_ids}
        animated_node_ids = changed_node_ids or touched_after or set(after_node_ids)

    before_edge_keys = {
        _edge_key(
            source=str(edge.get("source") or ""),
            source_handle=_as_handle(edge.get("sourceHandle")),
            target=str(edge.get("target") or ""),
            target_handle=_as_handle(edge.get("targetHandle")),
        )
        for edge in before.get("edges", [])
        if isinstance(edge, dict)
    }
    after_edge_keys = {
        _edge_key(
            source=str(edge.get("source") or ""),
            source_handle=_as_handle(edge.get("sourceHandle")),
            target=str(edge.get("target") or ""),
            target_handle=_as_handle(edge.get("targetHandle")),
        )
        for edge in after_edges
    }
    added_edge_keys = after_edge_keys - before_edge_keys

    if mode == "create":
        animated_edges = list(after_edges)
    else:
        animated_edges = []
        for edge in after_edges:
            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            source_handle = _as_handle(edge.get("sourceHandle"))
            target_handle = _as_handle(edge.get("targetHandle"))
            edge_key = _edge_key(
                source=source,
                source_handle=source_handle,
                target=target,
                target_handle=target_handle,
            )
            if (
                source in animated_node_ids
                or target in animated_node_ids
                or edge_key in added_edge_keys
            ):
                animated_edges.append(edge)

    steps: list[dict[str, Any]] = []

    def _append_step(
        *,
        kind: BuildStepKind,
        node_id: str | None = None,
        node_type: str | None = None,
        source_node_id: str | None = None,
        source_handle: str | None = None,
        target_node_id: str | None = None,
        target_handle: str | None = None,
        runtime_type: RuntimePrimitive | None = None,
        narration: str | None = None,
        is_new_node: bool = False,
    ) -> None:
        step_id = f"step-{len(steps) + 1:03d}"
        steps.append(
            {
                "step_id": step_id,
                "kind": kind,
                "node_id": node_id,
                "node_type": node_type,
                "source_node_id": source_node_id,
                "source_handle": source_handle,
                "target_node_id": target_node_id,
                "target_handle": target_handle,
                "runtime_type": runtime_type,
                "narration": narration,
                "is_new_node": bool(is_new_node),
                "order_index": len(steps),
            }
        )

    outgoing_by_source: dict[str, list[dict[str, Any]]] = {}
    incoming_animated_count: dict[str, int] = {node_id: 0 for node_id in animated_node_ids}
    for edge in animated_edges:
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        outgoing_by_source.setdefault(source, []).append(edge)
        if source in animated_node_ids and target in incoming_animated_count:
            incoming_animated_count[target] = incoming_animated_count.get(target, 0) + 1

    for source, source_edges in outgoing_by_source.items():
        source_edges.sort(
            key=lambda edge: (
                _node_y(str(edge.get("target") or ""), after_nodes_by_id),
                str(edge.get("target") or ""),
            )
        )

    root_ids = sorted(
        [
            node_id
            for node_id in animated_node_ids
            if incoming_animated_count.get(node_id, 0) == 0
        ],
        key=lambda node_id: (_node_y(node_id, after_nodes_by_id), node_id),
    )

    visited_nodes: set[str] = set()
    connected_edges: set[tuple[str, str | None, str, str | None]] = set()

    def _visit(node_id: str) -> None:
        if node_id in visited_nodes or node_id not in after_nodes_by_id:
            return
        visited_nodes.add(node_id)
        node = after_nodes_by_id[node_id]
        _append_step(
            kind="node_intro",
            node_id=node_id,
            node_type=str(node.get("type") or ""),
            is_new_node=node_id not in before_node_ids,
        )

        child_edges = outgoing_by_source.get(node_id, [])
        for idx, edge in enumerate(child_edges):
            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            source_handle = _as_handle(edge.get("sourceHandle"))
            target_handle = _as_handle(edge.get("targetHandle"))
            key = _edge_key(
                source=source,
                source_handle=source_handle,
                target=target,
                target_handle=target_handle,
            )
            if key not in connected_edges:
                _append_step(
                    kind="connect",
                    source_node_id=source,
                    source_handle=source_handle,
                    target_node_id=target,
                    target_handle=target_handle,
                    runtime_type=_runtime_type_for_edge(
                        source_node_id=source,
                        source_handle=source_handle,
                        nodes_by_id=after_nodes_by_id,
                    ),
                )
                connected_edges.add(key)
            if target in animated_node_ids and target not in visited_nodes:
                _visit(target)
            if idx < len(child_edges) - 1:
                _append_step(
                    kind="backtrack",
                    source_node_id=target,
                    target_node_id=node_id,
                )

    for root_id in root_ids:
        _visit(root_id)

    remaining = sorted(
        [node_id for node_id in animated_node_ids if node_id not in visited_nodes],
        key=lambda node_id: (_node_y(node_id, after_nodes_by_id), node_id),
    )
    for node_id in remaining:
        _visit(node_id)

    for edge in sorted(
        animated_edges,
        key=lambda item: (
            _node_y(str(item.get("source") or ""), after_nodes_by_id),
            _node_y(str(item.get("target") or ""), after_nodes_by_id),
            str(item.get("source") or ""),
            str(item.get("target") or ""),
        ),
    ):
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        source_handle = _as_handle(edge.get("sourceHandle"))
        target_handle = _as_handle(edge.get("targetHandle"))
        edge_key = _edge_key(
            source=source,
            source_handle=source_handle,
            target=target,
            target_handle=target_handle,
        )
        if edge_key in connected_edges:
            continue
        if target in animated_node_ids and target not in visited_nodes:
            _visit(target)
        _append_step(
            kind="connect",
            source_node_id=source,
            source_handle=source_handle,
            target_node_id=target,
            target_handle=target_handle,
            runtime_type=_runtime_type_for_edge(
                source_node_id=source,
                source_handle=source_handle,
                nodes_by_id=after_nodes_by_id,
            ),
        )
        connected_edges.add(edge_key)

    _attach_narrations_to_steps(
        steps=steps,
        request_text=request_text,
    )
    for index, step in enumerate(steps):
        step["order_index"] = index
    return steps


def _attach_narrations_to_steps(
    *,
    steps: list[dict[str, Any]],
    request_text: str,
) -> None:
    intro_steps = [step for step in steps if step.get("kind") == "node_intro"]
    if not intro_steps:
        return

    generated = _generate_step_narrations_with_gemini(
        request_text=request_text,
        intro_steps=intro_steps,
    )
    used_normalized: set[str] = set()
    fallback_count = 0
    for step in intro_steps:
        step_id = str(step.get("step_id") or "")
        narration = (generated.get(step_id) or "").strip()
        normalized = _normalize_text(narration)
        if normalized and normalized in used_normalized:
            narration = ""
        if not narration:
            fallback_count += 1
            narration = _fallback_narration_for_node(
                node_type=str(step.get("node_type") or ""),
            )
            normalized = _normalize_text(narration)
        if normalized:
            used_normalized.add(normalized)
        step["narration"] = narration
    if fallback_count:
        logger.info(
            "MicrAI narration fallback used for %s/%s intro steps.",
            fallback_count,
            len(intro_steps),
        )


def _generate_step_narrations_with_gemini(
    *,
    request_text: str,
    intro_steps: list[dict[str, Any]],
) -> dict[str, str]:
    schema = {
        "type": "object",
        "properties": {
            "narrations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "step_id": {"type": "string"},
                        "narration": {"type": "string"},
                    },
                    "required": ["step_id", "narration"],
                },
            }
        },
        "required": ["narrations"],
    }

    compact_steps = [
        {
            "step_id": step.get("step_id"),
            "node_type": step.get("node_type"),
            "is_new_node": bool(step.get("is_new_node")),
            "order_index": int(step.get("order_index", 0)),
        }
        for step in intro_steps
    ]

    instructions = f"""
You are writing short live narration lines for MicrAI building a workflow graph.
Return ONLY JSON that matches the schema.

User request:
{request_text}

Run nonce:
{secrets.token_hex(8)}

Node intro steps:
{json.dumps(compact_steps)}

Rules:
- One narration per step_id.
- Keep each narration to about 8-18 words.
- Tone: warm, conversational, personable, lightly playful and witty, humble, not too serious.
- Explain what the node does for the user and why it is included right now.
- Use fresh wording each run and avoid repeating the same sentence across multiple steps.
- No emojis.
"""
    try:
        response = query_gemini(
            instructions,
            response_schema=schema,
            response_mime_type="application/json",
        )
        if not isinstance(response, dict):
            return {}
        narrations = response.get("narrations")
        if not isinstance(narrations, list):
            content = response.get("content")
            if isinstance(content, str):
                try:
                    parsed_content = json.loads(content)
                except Exception:
                    parsed_content = None
                if isinstance(parsed_content, dict):
                    narrations = parsed_content.get("narrations")
            if not isinstance(narrations, list):
                return {}
        output: dict[str, str] = {}
        for item in narrations:
            if not isinstance(item, dict):
                continue
            step_id = str(item.get("step_id") or "").strip()
            narration = str(item.get("narration") or "").strip()
            if not step_id or not narration:
                continue
            output[step_id] = narration
        return output
    except Exception:
        logger.warning("Failed generating MicrAI step narrations with Gemini.", exc_info=True)
        return {}


def _fallback_narration_for_node(*, node_type: str) -> str:
    by_type = {
        "TextBucket": "Starting with a text bucket so you can drop in your source content.",
        "ImageBucket": "First up, an image bucket so your source visuals are ready to use.",
        "AudioBucket": "I am adding an audio bucket so we can work from your audio files.",
        "VideoBucket": "I will start with a video bucket so your clips have a clean entry point.",
        "Transcription": "Now transcription turns that media into usable text we can build from.",
        "TextGeneration": "This is the writing engine where your final draft actually gets composed.",
        "ImageExtraction": "I am extracting key frames so we can pick visuals from the source video.",
        "ImageMatching": "Here we match images against the text so the visuals stay context-aware.",
        "ImageGeneration": "This node generates new images from prompts when source assets are not enough.",
        "QuoteExtraction": "This extracts concise quotes so you can reuse the strongest sound bites.",
        "End": "Finally, End collects the output so it is ready for preview and publishing.",
    }
    return by_type.get(
        node_type,
        "I am placing this node to keep your workflow connected and execution-ready.",
    )


def _generate_closing_narration_with_gemini(
    *,
    request_text: str,
    node_count: int,
    edge_count: int,
) -> str:
    schema = {
        "type": "object",
        "properties": {
            "closing_narration": {"type": "string"},
        },
        "required": ["closing_narration"],
    }

    instructions = f"""
Write one short closing line MicrAI says after finishing workflow construction.
Return ONLY JSON that matches the schema.

User request:
{request_text}

Graph summary:
- nodes: {node_count}
- connections: {edge_count}

Run nonce:
{secrets.token_hex(8)}

Rules:
- 10-22 words.
- Warm, conversational, slightly playful, not corny.
- Mention the workflow is ready and invite the user to try it.
- No emojis.
"""
    try:
        response = query_gemini(
            instructions,
            response_schema=schema,
            response_mime_type="application/json",
        )
        if isinstance(response, dict):
            line = str(response.get("closing_narration") or "").strip()
            if line:
                return line
    except Exception:
        logger.warning(
            "Failed generating MicrAI closing narration with Gemini.",
            exc_info=True,
        )

    return _fallback_closing_narration(node_count=node_count, edge_count=edge_count)


def _fallback_closing_narration(*, node_count: int, edge_count: int) -> str:
    return (
        f"Done and dusted: {node_count} nodes and {edge_count} links are wired. "
        "Give it a run and tweak anything you want."
    )


def _runtime_type_for_edge(
    *,
    source_node_id: str,
    source_handle: str | None,
    nodes_by_id: dict[str, dict[str, Any]],
) -> RuntimePrimitive | None:
    source = nodes_by_id.get(source_node_id)
    if source is None:
        return None
    spec = get_node_spec(str(source.get("type") or ""))
    if spec is None:
        return None
    selected_handle = source_handle
    if not selected_handle and spec.outputs:
        selected_handle = spec.outputs[0].key
    for output in spec.outputs:
        if output.key != selected_handle:
            continue
        runtime = str(output.runtime_type or "")
        if runtime in {"Text", "ImageRef", "AudioRef", "VideoRef"}:
            return runtime  # type: ignore[return-value]
        return None
    return None


def _node_y(node_id: str, nodes_by_id: dict[str, dict[str, Any]]) -> float:
    node = nodes_by_id.get(node_id)
    if node is None:
        return 0.0
    position = node.get("position")
    if isinstance(position, dict):
        raw = position.get("y", 0)
        try:
            return float(raw)
        except Exception:
            return 0.0
    return 0.0


def _as_handle(value: Any) -> str | None:
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return None


def _edge_key(
    *,
    source: str,
    source_handle: str | None,
    target: str,
    target_handle: str | None,
) -> tuple[str, str | None, str, str | None]:
    return (source, source_handle, target, target_handle)


def _resolve_text_generation_settings(
    *,
    supabase_client: Any,
    user_id: str,
    request_text: str,
) -> dict[str, Any]:
    requested_variant = _infer_requested_preset_variant(request_text)
    explicit_request = _is_explicit_text_preset_request(request_text)
    target_channel = _infer_target_channel(request_text)

    presets = _fetch_accessible_text_presets(
        supabase_client=supabase_client,
        user_id=user_id,
    )
    if not presets:
        no_preset_gemini_overrides = _design_text_overrides_with_gemini(
            request_text=request_text,
            target_channel=target_channel,
            selected_preset=None,
        )
        no_preset_overrides = _resolve_text_overrides(
            request_text=request_text,
            target_channel=target_channel,
            selected_preset=None,
            gemini_choice=no_preset_gemini_overrides,
            explicit_request=explicit_request,
        )
        return {
            "preset_id": None,
            "preset_variant": requested_variant,
            "text_overrides": no_preset_overrides,
            "explicit_preset_request": explicit_request,
            "has_gemini_customization": bool(no_preset_gemini_overrides),
        }

    preset_by_id: dict[str, dict[str, Any]] = {}
    for preset in presets:
        pid = str(preset.get("id") or "").strip()
        if pid:
            preset_by_id[pid] = preset
    deduped_presets = list(preset_by_id.values())

    gemini_choice = _select_text_preset_with_gemini(
        request_text=request_text,
        presets=deduped_presets,
    )
    selected_preset: dict[str, Any] | None = None
    gemini_preset_id = (
        str(gemini_choice.get("preset_id") or "").strip()
        if isinstance(gemini_choice, dict)
        else ""
    )
    if gemini_preset_id in preset_by_id:
        selected_preset = preset_by_id[gemini_preset_id]
        if gemini_choice.get("preset_variant") in {"summary", "action_items"}:
            requested_variant = gemini_choice["preset_variant"]
    if selected_preset is None:
        selected_preset = _pick_best_matching_preset(
            presets=deduped_presets,
            request_text=request_text,
            target_channel=target_channel,
        )
    if selected_preset is None:
        deduped_presets.sort(key=lambda item: str(item.get("name") or "").lower())
        selected_preset = deduped_presets[0]

    overrides = _resolve_text_overrides(
        request_text=request_text,
        target_channel=target_channel,
        selected_preset=selected_preset,
        gemini_choice=_design_text_overrides_with_gemini(
            request_text=request_text,
            target_channel=target_channel,
            selected_preset=selected_preset,
        ),
        explicit_request=explicit_request,
    )

    return {
        "preset_id": str(selected_preset.get("id") or ""),
        "preset_variant": requested_variant,
        "text_overrides": overrides,
        "explicit_preset_request": explicit_request,
        "has_gemini_customization": True,
    }


def _fetch_accessible_text_presets(
    *,
    supabase_client: Any,
    user_id: str,
) -> list[dict[str, Any]]:
    try:
        public_result = (
            supabase_client.table("text_generation_presets")
            .select("*")
            .is_("user_id", "null")
            .execute()
        )
        user_result = (
            supabase_client.table("text_generation_presets")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        presets: list[dict[str, Any]] = []
        for item in (public_result.data or []):
            if isinstance(item, dict):
                presets.append(item)
        for item in (user_result.data or []):
            if isinstance(item, dict):
                presets.append(item)
        return presets
    except Exception:
        return []


def _select_text_preset_with_gemini(
    *,
    request_text: str,
    presets: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not presets:
        return None

    compact_presets = []
    for preset in presets:
        compact_presets.append(
            {
                "id": str(preset.get("id") or ""),
                "name": str(preset.get("name") or ""),
                "tone_guidance": str(preset.get("tone_guidance") or "")[:120],
                "max_length": preset.get("max_length"),
                "structure_template": str(preset.get("structure_template") or "")[:120],
            }
        )

    schema = {
        "type": "object",
        "properties": {
            "preset_id": {"type": "string"},
            "preset_variant": {"type": "string"},
        },
        "required": ["preset_id"],
    }

    instructions = f"""
Choose the single best text-generation preset for this request.
Return ONLY JSON matching the schema.

Request:
{request_text}

Available presets:
{json.dumps(compact_presets)}

If a summary is requested, preset_variant should be "summary".
If action items are requested, preset_variant should be "action_items".
Otherwise omit preset_variant or use an empty string.
"""
    try:
        response = query_gemini(
            instructions,
            response_schema=schema,
            response_mime_type="application/json",
        )
        if not isinstance(response, dict):
            return None
        if not str(response.get("preset_id") or "").strip():
            return None
        variant = str(response.get("preset_variant") or "").strip().lower()
        if variant not in {"summary", "action_items"}:
            response.pop("preset_variant", None)
        else:
            response["preset_variant"] = variant
        return response
    except Exception:
        return None


def _design_text_overrides_with_gemini(
    *,
    request_text: str,
    target_channel: str | None,
    selected_preset: dict[str, Any] | None,
) -> dict[str, Any] | None:
    channel_default_tone = _default_tone_for_channel(target_channel)
    channel_default_max = _default_max_length_for_channel(target_channel)
    channel_default_structure = _default_structure_for_channel(target_channel)

    preset_context = {
        "name": str((selected_preset or {}).get("name") or ""),
        "tone_guidance": str((selected_preset or {}).get("tone_guidance") or ""),
        "max_length": (selected_preset or {}).get("max_length"),
        "structure_template": str((selected_preset or {}).get("structure_template") or ""),
        "prompt": str((selected_preset or {}).get("prompt") or "")[:1200],
    }

    schema = {
        "type": "object",
        "properties": {
            "tone_guidance_override": {"type": "string"},
            "max_length_override": {"type": "integer"},
            "structure_template_override": {"type": "string"},
            "prompt_template_override": {"type": "string"},
            "output_format_override": {
                "type": "object",
                "additionalProperties": True,
            },
        },
        "required": [],
    }

    instructions = f"""
You are MicrAI text-generation settings designer.
Return ONLY JSON matching the schema.

Goal:
- Customize text-generation settings for this exact workflow request.
- Always return a complete usable configuration, even when user instructions are broad.

Constraints:
- prompt_template_override must be a full high-quality prompt template and MUST include {{source_context}}.
- max_length_override must be a positive character limit.
- Keep output_format_override empty unless user explicitly asks for strict JSON output schema.
- Tone and structure should reflect the user request first, then preset defaults, then channel defaults.
- If request wording includes style adjectives (for example: captivating, engaging, controversial, punchy),
  include those style cues explicitly in tone_guidance_override.

Request:
{request_text}

Target channel: {target_channel or "none"}

Selected preset context:
{json.dumps(preset_context)}

Fallback defaults:
- tone: {channel_default_tone}
- max_length: {channel_default_max}
- structure: {channel_default_structure or "none"}
"""
    try:
        response = query_gemini(
            instructions,
            response_schema=schema,
            response_mime_type="application/json",
        )
        if not isinstance(response, dict):
            return None
        out: dict[str, Any] = {}
        max_length = _parse_positive_int(
            response.get("max_length_override"),
            minimum=1,
            maximum=10000,
        )
        if max_length is not None:
            out["max_length_override"] = max_length
        tone = str(response.get("tone_guidance_override") or "").strip()
        if tone:
            out["tone_guidance_override"] = tone
        prompt_template = str(response.get("prompt_template_override") or "").strip()
        if prompt_template:
            if "{source_context}" not in prompt_template:
                prompt_template = f"{prompt_template}\n\nSOURCE CONTENT:\n{{source_context}}"
            out["prompt_template_override"] = prompt_template
        structure_template = str(response.get("structure_template_override") or "").strip()
        if structure_template:
            out["structure_template_override"] = structure_template
        output_override = response.get("output_format_override")
        if isinstance(output_override, dict):
            out["output_format_override"] = output_override
        return out or None
    except Exception:
        return None


def _default_tone_for_channel(target_channel: str | None) -> str:
    if target_channel and target_channel in DEFAULT_TEXT_TONE_BY_CHANNEL:
        return DEFAULT_TEXT_TONE_BY_CHANNEL[target_channel]
    return "Professional, clear, and conversational"


def _default_max_length_for_channel(target_channel: str | None) -> int:
    if target_channel and target_channel in DEFAULT_TEXT_MAX_LENGTH_BY_CHANNEL:
        return DEFAULT_TEXT_MAX_LENGTH_BY_CHANNEL[target_channel]
    return 1200


def _default_structure_for_channel(target_channel: str | None) -> str:
    if target_channel and target_channel in DEFAULT_TEXT_STRUCTURE_BY_CHANNEL:
        return DEFAULT_TEXT_STRUCTURE_BY_CHANNEL[target_channel]
    return ""


def _resolve_text_overrides(
    *,
    request_text: str,
    target_channel: str | None,
    selected_preset: dict[str, Any] | None,
    gemini_choice: dict[str, Any] | None,
    explicit_request: bool,
) -> dict[str, Any]:
    preset_tone = str((selected_preset or {}).get("tone_guidance") or "").strip()
    preset_structure = str((selected_preset or {}).get("structure_template") or "").strip()
    preset_max_length = _parse_positive_int(
        (selected_preset or {}).get("max_length"),
        minimum=1,
        maximum=10000,
    )

    default_tone = preset_tone or _default_tone_for_channel(target_channel)
    default_structure = preset_structure or _default_structure_for_channel(target_channel)
    default_max_length = preset_max_length or _default_max_length_for_channel(target_channel)

    overrides: dict[str, Any] = {
        "tone_guidance_override": default_tone,
        "max_length_override": default_max_length,
    }
    if default_structure:
        overrides["structure_template_override"] = default_structure

    heuristic_overrides = _extract_text_overrides_heuristic(
        request_text=request_text,
        target_channel=target_channel,
        base_max_length=default_max_length,
    )
    overrides.update(heuristic_overrides)

    if isinstance(gemini_choice, dict):
        for key in (
            "tone_guidance_override",
            "max_length_override",
            "structure_template_override",
            "prompt_template_override",
            "output_format_override",
        ):
            if key not in gemini_choice:
                continue
            value = gemini_choice.get(key)
            if key == "max_length_override":
                coerced = _parse_positive_int(value, minimum=1, maximum=10000)
                if coerced is not None:
                    overrides[key] = coerced
                continue
            if key == "output_format_override":
                if isinstance(value, dict):
                    overrides[key] = value
                continue
            if isinstance(value, str) and value.strip():
                overrides[key] = value.strip()

    # Always keep a valid tone/max payload.
    tone_clean = str(overrides.get("tone_guidance_override") or "").strip()
    if not tone_clean:
        tone_clean = default_tone
    overrides["tone_guidance_override"] = tone_clean

    max_length_clean = _parse_positive_int(
        overrides.get("max_length_override"),
        minimum=1,
        maximum=10000,
    )
    if max_length_clean is None:
        max_length_clean = default_max_length
    overrides["max_length_override"] = max_length_clean

    structure_clean = str(overrides.get("structure_template_override") or "").strip()
    if not structure_clean:
        structure_clean = default_structure
    if structure_clean:
        overrides["structure_template_override"] = structure_clean
    else:
        overrides.pop("structure_template_override", None)

    prompt_template = str(overrides.get("prompt_template_override") or "").strip()
    if not prompt_template:
        built_prompt_template = _build_prompt_template_override(
            request_text=request_text,
            target_channel=target_channel,
            selected_preset=selected_preset,
            tone_guidance_override=tone_clean or None,
            max_length_override=max_length_clean,
            structure_template_override=structure_clean or None,
        )
        if built_prompt_template:
            prompt_template = built_prompt_template
    if prompt_template:
        if "{source_context}" not in prompt_template:
            prompt_template = f"{prompt_template}\n\nSOURCE CONTENT:\n{{source_context}}"
        overrides["prompt_template_override"] = prompt_template

    output_override = overrides.get("output_format_override")
    if output_override is not None and not isinstance(output_override, dict):
        overrides.pop("output_format_override", None)

    # `explicit_request` is intentionally ignored here: MicrAI always emits
    # explicit text-generation customization so the node reflects user intent.
    _ = explicit_request
    return overrides


def _build_prompt_template_override(
    *,
    request_text: str,
    target_channel: str | None,
    selected_preset: dict[str, Any] | None,
    tone_guidance_override: str | None,
    max_length_override: int | None,
    structure_template_override: str | None,
) -> str | None:
    request_clean = request_text.strip()
    if not request_clean:
        return None

    channel_label = {
        "x": "X (Twitter)",
        "linkedin": "LinkedIn",
        "email": "email",
        "tiktok": "TikTok caption",
    }.get(target_channel or "", "social")

    preset_prompt = str((selected_preset or {}).get("prompt") or "").strip()
    preset_tone = str((selected_preset or {}).get("tone_guidance") or "").strip()
    preset_structure = str((selected_preset or {}).get("structure_template") or "").strip()

    tone_line = tone_guidance_override or preset_tone or "professional yet conversational"
    structure_line = structure_template_override or preset_structure
    length_line = (
        f"- Maximum length: {max_length_override} characters.\n"
        if max_length_override is not None
        else ""
    )
    structure_requirement = (
        f"- Structure: {structure_line}\n" if structure_line else ""
    )
    base_guidance_block = (
        "\nREFERENCE TEMPLATE GUIDANCE (adapt this where useful):\n"
        f"{preset_prompt}\n"
        if preset_prompt
        else ""
    )

    return (
        f"Create a high-quality {channel_label} post based on the provided content.\n\n"
        f"SOURCE CONTENT:\n{{source_context}}\n\n"
        f"USER REQUEST:\n{request_clean}\n\n"
        "REQUIREMENTS:\n"
        f"- Tone/style: {tone_line}.\n"
        f"{length_line}"
        f"{structure_requirement}"
        "- Keep claims grounded in provided content. Do not invent facts.\n"
        "- Write a single polished final draft.\n\n"
        "OUTPUT:\n"
        "- Return only the final post text unless a JSON schema is explicitly required.\n"
        f"{base_guidance_block}"
    )


def _extract_text_overrides_heuristic(
    *,
    request_text: str,
    target_channel: str | None,
    base_max_length: int | None,
) -> dict[str, Any]:
    lower = _normalize_text(request_text)
    overrides: dict[str, Any] = {}

    max_length_override = _extract_requested_max_length(request_text)
    if max_length_override is None:
        wants_longer = (
            _contains_phrase(lower, "longer")
            or _contains_phrase(lower, "long form")
            or _contains_phrase(lower, "long-form")
            or _contains_phrase(lower, "extended")
        )
        wants_shorter = (
            _contains_phrase(lower, "shorter")
            or _contains_phrase(lower, "brief")
            or _contains_phrase(lower, "concise")
        )
        if wants_longer:
            base = base_max_length or (280 if target_channel == "x" else 1200)
            max_length_override = min(10000, max(base + 120, int(base * 1.5)))
        elif wants_shorter and base_max_length:
            max_length_override = max(80, int(base_max_length * 0.75))

    if max_length_override is not None:
        overrides["max_length_override"] = max_length_override

    tone_override = _extract_requested_tone_guidance(request_text)
    if tone_override:
        overrides["tone_guidance_override"] = tone_override

    structure_override = _extract_requested_structure_template(request_text)
    if structure_override:
        overrides["structure_template_override"] = structure_override

    prompt_template_override = _extract_requested_prompt_template(request_text)
    if prompt_template_override:
        overrides["prompt_template_override"] = prompt_template_override

    return overrides


def _extract_requested_max_length(request_text: str) -> int | None:
    patterns = [
        r"(?:max(?:imum)?(?:\s+length)?|limit(?:ed)?(?:\s+to)?|up to|under|at most|around|about)\s*(\d{2,5})\s*(?:characters|character|chars|char)\b",
        r"\b(\d{2,5})\s*(?:characters|character|chars|char)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, request_text, flags=re.IGNORECASE)
        if not match:
            continue
        parsed = _parse_positive_int(match.group(1), minimum=1, maximum=10000)
        if parsed is not None:
            return parsed
    return None


def _extract_requested_tone_guidance(request_text: str) -> str | None:
    patterns = [
        r"(?:tone|voice|style)\s*(?:should be|to be|=|:)\s*([^\n\.;]+)",
        r"(?:write|written)\s+(?:in|with)\s+(?:an?\s+)?([^\n\.;]+?)\s+tone",
    ]
    for pattern in patterns:
        match = re.search(pattern, request_text, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = match.group(1).strip(" -,:;.")
        if candidate:
            return candidate

    lower = _normalize_text(request_text)
    style_terms: list[str] = []
    for term in TONE_STYLE_TERMS:
        if _contains_phrase(lower, term):
            normalized_term = term.replace("-", " ")
            if normalized_term not in style_terms:
                style_terms.append(normalized_term)
    if style_terms:
        if "captivating" in style_terms and "engaging" not in style_terms:
            style_terms.append("engaging")
        if "controversial" in style_terms and "opinionated" not in style_terms:
            style_terms.append("opinionated")
        if "story driven" in style_terms and "storytelling" not in style_terms:
            style_terms.append("storytelling")
        return ", ".join(style_terms)
    return None


def _extract_requested_structure_template(request_text: str) -> str | None:
    patterns = [
        r"(?:output structure|structure|format)\s*(?:should be|to be|=|:)\s*([^\n\.]+)",
        r"(?:use|follow)\s+(?:this\s+)?structure\s*[:\-]\s*([^\n\.]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, request_text, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = match.group(1).strip(" -,:;.")
        if candidate:
            return candidate

    lower = _normalize_text(request_text)
    if _contains_phrase(lower, "bullet points") or _contains_phrase(lower, "bullets"):
        return "Bullet points"
    return None


def _extract_requested_prompt_template(request_text: str) -> str | None:
    patterns = [
        r"(?:prompt template|template prompt|prompt)\s*(?:should be|to be|=|:)\s*([\s\S]{20,})$",
    ]
    for pattern in patterns:
        match = re.search(pattern, request_text, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = match.group(1).strip()
        if candidate:
            if "{source_context}" not in candidate:
                candidate = f"{candidate}\n\nSOURCE CONTENT:\n{{source_context}}"
            return candidate
    return None


def _parse_positive_int(
    value: Any,
    *,
    minimum: int,
    maximum: int,
) -> int | None:
    try:
        parsed = int(str(value).replace(",", "").strip())
    except Exception:
        return None
    if parsed < minimum or parsed > maximum:
        return None
    return parsed


def _pick_best_matching_preset(
    *,
    presets: list[dict[str, Any]],
    request_text: str,
    target_channel: str | None,
) -> dict[str, Any] | None:
    if not presets:
        return None

    normalized_request = _normalize_text(request_text)
    request_tokens = _extract_request_tokens(request_text)
    requested_variant = _infer_requested_preset_variant(request_text)

    best_score = -1
    best_preset: dict[str, Any] | None = None

    for preset in presets:
        score = 0
        name = _normalize_text(str(preset.get("name") or ""))
        blob = _preset_search_blob(preset)

        if target_channel and _preset_matches_channel(blob=blob, channel=target_channel):
            score += 35
        elif target_channel:
            score -= 8

        if requested_variant == "summary" and _contains_phrase(blob, "summary"):
            score += 18
        if requested_variant == "action_items" and (
            _contains_phrase(blob, "action items")
            or _contains_phrase(blob, "action item")
        ):
            score += 18

        for token in request_tokens:
            if token == "x":
                if _preset_matches_channel(blob=blob, channel="x"):
                    score += 14
                continue
            if _contains_phrase(blob, token):
                score += 3

        # Strong preference for exact preset-name mention in the request.
        if name and _contains_phrase(normalized_request, name):
            score += 40

        if bool(preset.get("is_default")):
            score += 1

        if score > best_score:
            best_score = score
            best_preset = preset

    return best_preset


def _preset_search_blob(preset: dict[str, Any]) -> str:
    parts = [
        str(preset.get("name") or ""),
        str(preset.get("tone_guidance") or ""),
        str(preset.get("structure_template") or ""),
        str(preset.get("prompt") or ""),
    ]
    return _normalize_text(" ".join(parts))


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def _contains_phrase(text: str, phrase: str) -> bool:
    normalized_text = f" {_normalize_text(text)} "
    normalized_phrase = _normalize_text(phrase)
    if not normalized_phrase:
        return False
    return f" {normalized_phrase} " in normalized_text


def _extract_request_tokens(request_text: str) -> set[str]:
    normalized = _normalize_text(request_text)
    tokens: set[str] = set()
    for token in normalized.split():
        if token == "x":
            tokens.add(token)
            continue
        if len(token) < 3:
            continue
        if token in TEXT_PRESET_STOPWORDS:
            continue
        tokens.add(token)
    return tokens


def _infer_requested_preset_variant(request_text: str) -> PresetVariant | None:
    lower = _normalize_text(request_text)
    wants_action_items = (
        _contains_phrase(lower, "action items")
        or _contains_phrase(lower, "action item")
        or _contains_phrase(lower, "next steps")
        or _contains_phrase(lower, "todo")
        or _contains_phrase(lower, "to do")
    )
    wants_summary = (
        _contains_phrase(lower, "summary")
        or _contains_phrase(lower, "summarize")
        or _contains_phrase(lower, "summarise")
        or _contains_phrase(lower, "tl dr")
        or _contains_phrase(lower, "tldr")
    )
    if wants_action_items and not wants_summary:
        return "action_items"
    if wants_summary and not wants_action_items:
        return "summary"
    return None


def _is_explicit_text_preset_request(request_text: str) -> bool:
    lower = _normalize_text(request_text)
    if _infer_target_channel(request_text):
        return True
    if _infer_requested_preset_variant(request_text):
        return True
    return any(_contains_phrase(lower, word) for word in STYLE_SIGNAL_KEYWORDS)


def _preset_matches_channel(*, blob: str, channel: str) -> bool:
    normalized_blob = _normalize_text(blob)
    if channel == "linkedin":
        return _contains_phrase(normalized_blob, "linkedin")
    if channel == "email":
        return _contains_phrase(normalized_blob, "email")
    if channel == "x":
        return (
            _contains_phrase(normalized_blob, "twitter")
            or _contains_phrase(normalized_blob, "tweet")
            or _contains_phrase(normalized_blob, "x post")
            or _contains_phrase(normalized_blob, "ex post")
            or _contains_phrase(normalized_blob, "x thread")
            or _contains_phrase(normalized_blob, "x")
        )
    return False


def _infer_target_channel(prompt: str) -> str | None:
    lower = _normalize_text(prompt)
    if _contains_phrase(lower, "linkedin"):
        return "linkedin"
    if _contains_phrase(lower, "tiktok"):
        return "tiktok"
    if _contains_phrase(lower, "email"):
        return "email"
    if (
        _contains_phrase(lower, "x post")
        or _contains_phrase(lower, "ex post")
        or _contains_phrase(lower, "x thread")
        or _contains_phrase(lower, "x-post")
        or _contains_phrase(lower, "ex-post")
        or _contains_phrase(lower, "twitter")
        or _contains_phrase(lower, "tweet")
        or _contains_phrase(lower, "x")
    ):
        return "x"
    return None


def _resolve_end_output_key(
    *,
    request_text: str,
    target_channel_hint: str | None,
) -> str | None:
    schema = {
        "type": "object",
        "properties": {
            "output_key": {
                "type": "string",
                "enum": ["linkedin_post", "x_post", "email", ""],
            }
        },
        "required": ["output_key"],
    }
    instructions = f"""
Choose the best End node output_key for this workflow request.
Return ONLY JSON matching the schema.

Allowed output_key values:
- linkedin_post
- x_post
- email
- "" (use default auto when request does not clearly specify a channel)

Channel hint: {target_channel_hint or "none"}
Request:
{request_text}
"""
    try:
        response = query_gemini(
            instructions,
            response_schema=schema,
            response_mime_type="application/json",
        )
        if isinstance(response, dict):
            output_key = str(response.get("output_key") or "").strip()
            if output_key in {"linkedin_post", "x_post", "email"}:
                return output_key
    except Exception:
        pass

    if target_channel_hint in TARGET_CHANNEL_TO_END_OUTPUT_KEY:
        return TARGET_CHANNEL_TO_END_OUTPUT_KEY[target_channel_hint]
    return None


def _node_index(nodes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        out.setdefault(node["type"], []).append(node)
    return out


def _find_first_node_id(workflow: dict[str, Any], node_type: str) -> str | None:
    for node in workflow["nodes"]:
        if node["type"] == node_type:
            return node["id"]
    return None


def _next_node_id(workflow: dict[str, Any], node_type: str) -> str:
    used = {node["id"] for node in workflow["nodes"]}
    i = 1
    while True:
        candidate = f"{node_type}-{i}"
        if candidate not in used:
            return candidate
        i += 1


def _add_node(
    workflow: dict[str, Any],
    node_type: str,
    x: float,
    y: float,
    data: dict[str, Any] | None = None,
) -> str:
    node_id = _next_node_id(workflow, node_type)
    payload = {
        "id": node_id,
        "type": node_type,
        "position": {"x": float(x), "y": float(y)},
        "data": {"label": DEFAULT_NODE_LABELS.get(node_type, node_type)},
    }
    if data:
        payload["data"].update(copy.deepcopy(data))
    workflow["nodes"].append(payload)
    return node_id


def _add_edge(
    workflow: dict[str, Any],
    source: str,
    source_handle: str,
    target: str,
    target_handle: str,
) -> None:
    key = (source, source_handle, target, target_handle)
    for edge in workflow["edges"]:
        existing = (
            edge["source"],
            edge.get("sourceHandle"),
            edge["target"],
            edge.get("targetHandle"),
        )
        if existing == key:
            return
    edge_id = f"edge-{source}-{source_handle}-{target}-{target_handle}"
    workflow["edges"].append(
        {
            "id": edge_id,
            "source": source,
            "sourceHandle": source_handle,
            "target": target,
            "targetHandle": target_handle,
        }
    )


def _add_edge_if_missing(
    workflow: dict[str, Any],
    edge_tuples: set[tuple[str, str | None, str, str | None]],
    source: str,
    source_handle: str,
    target: str,
    target_handle: str,
) -> None:
    key = (source, source_handle, target, target_handle)
    if key in edge_tuples:
        return
    _add_edge(
        workflow,
        source=source,
        source_handle=source_handle,
        target=target,
        target_handle=target_handle,
    )
    edge_tuples.add(key)
