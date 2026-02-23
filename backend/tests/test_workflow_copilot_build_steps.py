from __future__ import annotations

from app.services.workflow_copilot import (
    _apply_end_output_key_selection,
    _build_guided_build_steps,
    _compute_operations_and_touched_nodes,
    _resolve_text_overrides,
)


def _node(node_id: str, node_type: str, x: float, y: float):
    return {
        "id": node_id,
        "type": node_type,
        "position": {"x": x, "y": y},
        "data": {"label": node_type},
    }


def _edge(
    source: str,
    source_handle: str,
    target: str,
    target_handle: str,
):
    return {
        "id": f"edge-{source}-{source_handle}-{target}-{target_handle}",
        "source": source,
        "sourceHandle": source_handle,
        "target": target,
        "targetHandle": target_handle,
    }


def test_create_build_steps_include_intro_connect_and_backtrack(monkeypatch):
    monkeypatch.setattr(
        "app.services.workflow_copilot.query_gemini",
        lambda *args, **kwargs: {"narrations": []},
    )

    before = {"nodes": [], "edges": []}
    after = {
        "nodes": [
            _node("VideoBucket-1", "VideoBucket", 120, 220),
            _node("ImageExtraction-1", "ImageExtraction", 420, 110),
            _node("Transcription-1", "Transcription", 420, 360),
            _node("TextGeneration-1", "TextGeneration", 740, 360),
            _node("ImageMatching-1", "ImageMatching", 1020, 220),
            _node("End-1", "End", 1320, 220),
        ],
        "edges": [
            _edge("VideoBucket-1", "videos", "ImageExtraction-1", "source"),
            _edge("VideoBucket-1", "videos", "Transcription-1", "video"),
            _edge("Transcription-1", "transcription", "TextGeneration-1", "text"),
            _edge("ImageExtraction-1", "images", "ImageMatching-1", "images"),
            _edge("TextGeneration-1", "generated_text", "ImageMatching-1", "text"),
            _edge("ImageMatching-1", "images", "End-1", "end-input"),
        ],
    }
    operations, touched = _compute_operations_and_touched_nodes(before=before, after=after)
    steps = _build_guided_build_steps(
        before=before,
        after=after,
        mode="create",
        operations=operations,
        touched_node_ids=touched,
        request_text="Turn video into a LinkedIn post with matching images",
    )

    intro_nodes = [step["node_id"] for step in steps if step.get("kind") == "node_intro"]
    assert set(intro_nodes) == {node["id"] for node in after["nodes"]}
    assert any(step.get("kind") == "connect" for step in steps)
    assert any(step.get("kind") == "backtrack" for step in steps)


def test_edit_build_steps_focus_on_changed_nodes_and_connectors(monkeypatch):
    monkeypatch.setattr(
        "app.services.workflow_copilot.query_gemini",
        lambda *args, **kwargs: {"narrations": []},
    )

    before = {
        "nodes": [
            _node("TextBucket-1", "TextBucket", 180, 220),
            _node("TextGeneration-1", "TextGeneration", 520, 220),
            _node("End-1", "End", 860, 220),
        ],
        "edges": [
            _edge("TextBucket-1", "text", "TextGeneration-1", "text"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
        ],
    }
    after = {
        "nodes": [
            _node("TextBucket-1", "TextBucket", 180, 220),
            _node("TextGeneration-1", "TextGeneration", 520, 220),
            _node("ImageMatching-1", "ImageMatching", 850, 220),
            _node("End-1", "End", 1150, 220),
        ],
        "edges": [
            _edge("TextBucket-1", "text", "TextGeneration-1", "text"),
            _edge("TextGeneration-1", "generated_text", "ImageMatching-1", "text"),
            _edge("ImageMatching-1", "images", "End-1", "end-input"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
        ],
    }

    operations, touched = _compute_operations_and_touched_nodes(before=before, after=after)
    steps = _build_guided_build_steps(
        before=before,
        after=after,
        mode="edit",
        operations=operations,
        touched_node_ids=touched,
        request_text="Add image matching",
    )

    intro_nodes = [step["node_id"] for step in steps if step.get("kind") == "node_intro"]
    assert "ImageMatching-1" in intro_nodes
    # Ensure changed connectors to untouched nodes are still animated.
    assert any(
        step.get("kind") == "connect"
        and step.get("source_node_id") == "TextGeneration-1"
        and step.get("target_node_id") == "ImageMatching-1"
        for step in steps
    )


def test_build_steps_have_fallback_narration_when_gemini_unavailable(monkeypatch):
    def raise_error(*args, **kwargs):
        raise RuntimeError("Gemini unavailable")

    monkeypatch.setattr("app.services.workflow_copilot.query_gemini", raise_error)

    before = {"nodes": [], "edges": []}
    after = {
        "nodes": [
            _node("TextBucket-1", "TextBucket", 180, 220),
            _node("TextGeneration-1", "TextGeneration", 520, 220),
            _node("End-1", "End", 860, 220),
        ],
        "edges": [
            _edge("TextBucket-1", "text", "TextGeneration-1", "text"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
        ],
    }
    operations, touched = _compute_operations_and_touched_nodes(before=before, after=after)
    steps = _build_guided_build_steps(
        before=before,
        after=after,
        mode="create",
        operations=operations,
        touched_node_ids=touched,
        request_text="Make an X post from article text",
    )

    intro_steps = [step for step in steps if step.get("kind") == "node_intro"]
    assert intro_steps
    for step in intro_steps:
        narration = str(step.get("narration") or "").strip()
        assert narration


def test_apply_end_output_key_selection_sets_end_node_output_key():
    workflow = {
        "nodes": [
            _node("TextGeneration-1", "TextGeneration", 520, 220),
            _node("End-1", "End", 860, 220),
        ],
        "edges": [],
    }
    _apply_end_output_key_selection(workflow, end_output_key="linkedin_post")
    end_node = next(node for node in workflow["nodes"] if node["type"] == "End")
    assert end_node["data"]["output_key"] == "linkedin_post"


def test_resolve_text_overrides_always_returns_core_customization_fields():
    overrides = _resolve_text_overrides(
        request_text="Turn this article into an X post",
        target_channel="x",
        selected_preset=None,
        gemini_choice=None,
        explicit_request=False,
    )
    assert isinstance(overrides.get("tone_guidance_override"), str)
    assert overrides.get("tone_guidance_override")
    assert isinstance(overrides.get("max_length_override"), int)
    assert overrides.get("max_length_override") > 0
    assert isinstance(overrides.get("prompt_template_override"), str)
    assert "{source_context}" in overrides.get("prompt_template_override", "")
