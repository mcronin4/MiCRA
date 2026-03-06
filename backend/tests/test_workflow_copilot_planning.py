from __future__ import annotations

from app.services.workflow_copilot import (
    _align_multi_end_routing_and_text_settings,
    plan_workflow_with_copilot,
)


def _node(node_id: str, node_type: str, x: float, y: float) -> dict:
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
) -> dict:
    return {
        "id": f"edge-{source}-{source_handle}-{target}-{target_handle}",
        "source": source,
        "sourceHandle": source_handle,
        "target": target,
        "targetHandle": target_handle,
    }


def _settings_with_preset() -> dict:
    return {
        "preset_id": "preset-1",
        "preset_variant": None,
        "text_overrides": {},
        "explicit_preset_request": False,
    }


def test_plan_workflow_uses_gemini_repair_when_candidate_ports_are_invalid(monkeypatch):
    invalid_gemini_workflow = {
        "nodes": [
            _node("AudioBucket-1", "AudioBucket", 100, 220),
            _node("Transcription-1", "Transcription", 380, 220),
            _node("TextGeneration-1", "TextGeneration", 680, 220),
            _node("End-1", "End", 980, 220),
        ],
        "edges": [
            # Invalid runtime mapping on purpose: AudioRef -> video input.
            _edge("AudioBucket-1", "audio", "Transcription-1", "video"),
            _edge("Transcription-1", "transcription", "TextGeneration-1", "text"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
        ],
    }
    repaired_workflow = {
        "nodes": invalid_gemini_workflow["nodes"],
        "edges": [
            _edge("AudioBucket-1", "audio", "Transcription-1", "audio"),
            _edge("Transcription-1", "transcription", "TextGeneration-1", "text"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
        ],
    }

    calls = {"repair": 0}

    def fake_query_gemini(prompt: str, *args, **kwargs):
        if "workflow repair specialist" in prompt:
            calls["repair"] += 1
            return {"workflow_data": repaired_workflow}
        if "workflow planner" in prompt:
            return {"workflow_data": invalid_gemini_workflow}
        return {}

    monkeypatch.setattr(
        "app.services.workflow_copilot._resolve_text_generation_settings",
        lambda **kwargs: _settings_with_preset(),
    )
    monkeypatch.setattr(
        "app.services.workflow_copilot._resolve_end_output_key",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        "app.services.workflow_copilot._build_guided_build_steps",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "app.services.workflow_copilot._generate_closing_narration_with_gemini",
        lambda **kwargs: "ready",
    )
    monkeypatch.setattr("app.services.workflow_copilot.query_gemini", fake_query_gemini)

    result = plan_workflow_with_copilot(
        message="Turn this podcast into a LinkedIn post",
        mode="create",
        workflow_data=None,
        user_id="user-1",
        supabase_client=object(),
    )

    assert result.status == "ready"
    assert calls["repair"] >= 1
    assert result.workflow_data is not None
    assert any(
        edge.get("source") == "AudioBucket-1"
        and edge.get("sourceHandle") == "audio"
        and edge.get("target") == "Transcription-1"
        and edge.get("targetHandle") == "audio"
        for edge in result.workflow_data.get("edges", [])
    )


def test_plan_workflow_falls_back_when_gemini_plan_and_repair_are_invalid(monkeypatch):
    invalid_gemini_workflow = {
        "nodes": [
            _node("AudioBucket-1", "AudioBucket", 100, 220),
            _node("Transcription-1", "Transcription", 380, 220),
            _node("End-1", "End", 980, 220),
        ],
        "edges": [
            # Invalid source handle for AudioBucket on purpose.
            _edge("AudioBucket-1", "videos", "Transcription-1", "audio"),
            _edge("Transcription-1", "transcription", "End-1", "end-input"),
        ],
    }

    calls = {"repair": 0}

    def fake_query_gemini(prompt: str, *args, **kwargs):
        if "workflow repair specialist" in prompt:
            calls["repair"] += 1
            return {"content": "not valid workflow json"}
        if "workflow planner" in prompt:
            return {"workflow_data": invalid_gemini_workflow}
        return {}

    monkeypatch.setattr(
        "app.services.workflow_copilot._resolve_text_generation_settings",
        lambda **kwargs: _settings_with_preset(),
    )
    monkeypatch.setattr(
        "app.services.workflow_copilot._resolve_end_output_key",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        "app.services.workflow_copilot._build_guided_build_steps",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "app.services.workflow_copilot._generate_closing_narration_with_gemini",
        lambda **kwargs: "ready",
    )
    monkeypatch.setattr("app.services.workflow_copilot.query_gemini", fake_query_gemini)

    result = plan_workflow_with_copilot(
        message=(
            "Turn a YouTube video and a podcast into a LinkedIn post and an X post "
            "with matching images."
        ),
        mode="create",
        workflow_data=None,
        user_id="user-1",
        supabase_client=object(),
    )

    assert result.status == "ready"
    assert calls["repair"] >= 1
    assert result.workflow_data is not None
    end_nodes = [node for node in result.workflow_data.get("nodes", []) if node.get("type") == "End"]
    output_keys = {
        str((node.get("data") or {}).get("output_key") or "").strip()
        for node in end_nodes
    }
    assert "linkedin_post" in output_keys
    assert "x_post" in output_keys


def test_align_multi_end_routing_applies_channel_presets_and_removes_cross_text_edges():
    workflow = {
        "nodes": [
            _node("Transcription-1", "Transcription", 300, 120),
            _node("Transcription-2", "Transcription", 300, 320),
            _node("TextGeneration-1", "TextGeneration", 700, 120),
            _node("TextGeneration-2", "TextGeneration", 700, 320),
            _node("ImageMatching-1", "ImageMatching", 980, 120),
            _node("ImageMatching-2", "ImageMatching", 980, 320),
            _node("End-1", "End", 1280, 120),
            _node("End-2", "End", 1280, 320),
        ],
        "edges": [
            _edge("Transcription-1", "transcription", "TextGeneration-1", "text"),
            _edge("Transcription-2", "transcription", "TextGeneration-2", "text"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
            _edge("TextGeneration-1", "generated_text", "End-2", "end-input"),
            _edge("TextGeneration-2", "generated_text", "End-2", "end-input"),
            _edge("TextGeneration-1", "generated_text", "ImageMatching-1", "text"),
            _edge("TextGeneration-2", "generated_text", "ImageMatching-2", "text"),
        ],
    }
    end_1 = next(node for node in workflow["nodes"] if node["id"] == "End-1")
    end_1["data"]["output_key"] = "linkedin_post"
    end_2 = next(node for node in workflow["nodes"] if node["id"] == "End-2")
    end_2["data"]["output_key"] = "x_post"

    tg_1 = next(node for node in workflow["nodes"] if node["id"] == "TextGeneration-1")
    tg_1["data"]["preset_id"] = "linkedin-default"
    tg_2 = next(node for node in workflow["nodes"] if node["id"] == "TextGeneration-2")
    tg_2["data"]["preset_id"] = "linkedin-default"

    _align_multi_end_routing_and_text_settings(
        workflow,
        channel_text_settings_by_output_key={
            "linkedin_post": {
                "preset_id": "linkedin-preset",
                "preset_variant": "summary",
                "text_overrides": {"tone_guidance_override": "professional"},
            },
            "x_post": {
                "preset_id": "x-preset",
                "preset_variant": "action_items",
                "text_overrides": {"tone_guidance_override": "punchy"},
            },
        },
    )

    edges = workflow["edges"]
    text_to_end_edges = [
        edge
        for edge in edges
        if edge["source"].startswith("TextGeneration-")
        and edge["target"].startswith("End-")
        and edge.get("targetHandle") == "end-input"
    ]
    assert len(text_to_end_edges) == 2
    assert any(
        edge["source"] == "TextGeneration-1" and edge["target"] == "End-1"
        for edge in text_to_end_edges
    )
    assert any(
        edge["source"] == "TextGeneration-2" and edge["target"] == "End-2"
        for edge in text_to_end_edges
    )

    assert tg_1["data"]["preset_id"] == "linkedin-preset"
    assert tg_2["data"]["preset_id"] == "x-preset"

    assert any(
        edge["target"] == "End-1" and edge["source"].startswith("ImageMatching-")
        for edge in edges
    )
    assert any(
        edge["target"] == "End-2" and edge["source"].startswith("ImageMatching-")
        for edge in edges
    )


def test_align_multi_end_routing_creates_second_text_generation_when_missing():
    workflow = {
        "nodes": [
            _node("Transcription-1", "Transcription", 300, 120),
            _node("Transcription-2", "Transcription", 300, 320),
            _node("TextGeneration-1", "TextGeneration", 700, 200),
            _node("ImageExtraction-1", "ImageExtraction", 720, 60),
            _node("ImageMatching-1", "ImageMatching", 980, 180),
            _node("End-1", "End", 1280, 120),
            _node("End-2", "End", 1280, 320),
        ],
        "edges": [
            _edge("Transcription-1", "transcription", "TextGeneration-1", "text"),
            _edge("Transcription-2", "transcription", "TextGeneration-1", "text"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
            _edge("Transcription-2", "transcription", "End-2", "end-input"),
            _edge("ImageExtraction-1", "images", "ImageMatching-1", "images"),
            _edge("TextGeneration-1", "generated_text", "ImageMatching-1", "text"),
            _edge("ImageMatching-1", "images", "End-1", "end-input"),
            _edge("ImageMatching-1", "images", "End-2", "end-input"),
        ],
    }
    end_1 = next(node for node in workflow["nodes"] if node["id"] == "End-1")
    end_1["data"]["output_key"] = "linkedin_post"
    end_2 = next(node for node in workflow["nodes"] if node["id"] == "End-2")
    end_2["data"]["output_key"] = "x_post"
    tg_1 = next(node for node in workflow["nodes"] if node["id"] == "TextGeneration-1")
    tg_1["data"]["preset_id"] = "linkedin-default"

    _align_multi_end_routing_and_text_settings(
        workflow,
        channel_text_settings_by_output_key={
            "linkedin_post": {
                "preset_id": "linkedin-preset",
                "text_overrides": {"tone_guidance_override": "professional"},
            },
            "x_post": {
                "preset_id": "x-preset",
                "text_overrides": {"tone_guidance_override": "punchy"},
            },
        },
    )

    text_nodes = [node for node in workflow["nodes"] if node["type"] == "TextGeneration"]
    assert len(text_nodes) == 2

    text_to_end_edges = [
        edge
        for edge in workflow["edges"]
        if edge["target"] in {"End-1", "End-2"}
        and edge["targetHandle"] == "end-input"
        and edge["source"].startswith("TextGeneration-")
    ]
    assert len(text_to_end_edges) == 2
    source_for_end_1 = next(edge["source"] for edge in text_to_end_edges if edge["target"] == "End-1")
    source_for_end_2 = next(edge["source"] for edge in text_to_end_edges if edge["target"] == "End-2")
    assert source_for_end_1 != source_for_end_2

    assert not any(
        edge["source"] == "Transcription-2" and edge["target"] == "End-2"
        for edge in workflow["edges"]
    )

    text_edges_for_second = [
        edge
        for edge in workflow["edges"]
        if edge["target"] == source_for_end_2 and edge["targetHandle"] == "text"
    ]
    sources_into_second = {edge["source"] for edge in text_edges_for_second}
    assert "Transcription-1" in sources_into_second
    assert "Transcription-2" in sources_into_second

    text_node_by_id = {node["id"]: node for node in text_nodes}
    assert text_node_by_id[source_for_end_1]["data"]["preset_id"] == "linkedin-preset"
    assert text_node_by_id[source_for_end_2]["data"]["preset_id"] == "x-preset"
