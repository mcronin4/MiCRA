from __future__ import annotations

from app.services.workflow_copilot import (
    _apply_end_output_key_selection,
    _apply_request_graph_preferences,
    _request_explicitly_mentions_multiple_outputs,
)


def _node(
    node_id: str,
    node_type: str,
    x: float,
    y: float,
    data: dict | None = None,
):
    payload = {
        "id": node_id,
        "type": node_type,
        "position": {"x": x, "y": y},
        "data": {"label": node_type},
    }
    if data:
        payload["data"].update(data)
    return payload


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


def test_request_graph_preferences_canonicalize_single_linkedin_post_with_images():
    workflow = {
        "nodes": [
            _node("VideoBucket-1", "VideoBucket", 120, 220),
            _node("Transcription-1", "Transcription", 420, 360),
            _node("ImageExtraction-1", "ImageExtraction", 420, 120),
            _node("TextGeneration-1", "TextGeneration", 720, 360, {"preset_id": "preset-1"}),
            _node("TextGeneration-2", "TextGeneration", 760, 120, {"preset_id": "preset-1"}),
            _node("ImageMatching-1", "ImageMatching", 1020, 220),
            _node("End-1", "End", 1320, 160, {"output_key": "linkedin_post"}),
            _node("End-2", "End", 1320, 320, {"output_key": "linkedin_images"}),
        ],
        "edges": [
            _edge("VideoBucket-1", "videos", "Transcription-1", "video"),
            _edge("VideoBucket-1", "videos", "ImageExtraction-1", "source"),
            _edge("Transcription-1", "transcription", "TextGeneration-1", "text"),
            _edge("Transcription-1", "transcription", "TextGeneration-2", "text"),
            _edge("ImageExtraction-1", "images", "ImageMatching-1", "images"),
            _edge("Transcription-1", "transcription", "ImageMatching-1", "text"),
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
            _edge("TextGeneration-2", "generated_text", "End-2", "end-input"),
            _edge("ImageMatching-1", "images", "End-2", "end-input"),
        ],
    }

    _apply_request_graph_preferences(
        workflow,
        request_text="Turn my demo video into a LinkedIn post with images",
        target_channel="linkedin",
        end_output_key="linkedin_post",
        preset_id="preset-1",
        single_output_request=True,
    )
    _apply_end_output_key_selection(
        workflow,
        end_output_key="linkedin_post",
        overwrite_all_ends=True,
    )

    text_generation_nodes = [
        node for node in workflow["nodes"] if node["type"] == "TextGeneration"
    ]
    end_nodes = [node for node in workflow["nodes"] if node["type"] == "End"]

    assert len(text_generation_nodes) == 1
    assert len(end_nodes) == 1

    edge_keys = {
        (
            edge["source"],
            edge.get("sourceHandle"),
            edge["target"],
            edge.get("targetHandle"),
        )
        for edge in workflow["edges"]
    }

    assert (
        "TextGeneration-1",
        "generated_text",
        "ImageMatching-1",
        "text",
    ) in edge_keys
    assert (
        "Transcription-1",
        "transcription",
        "ImageMatching-1",
        "text",
    ) not in edge_keys
    assert (
        "TextGeneration-1",
        "generated_text",
        "End-1",
        "end-input",
    ) in edge_keys
    assert (
        "ImageMatching-1",
        "images",
        "End-1",
        "end-input",
    ) in edge_keys
    assert end_nodes[0]["data"]["output_key"] == "linkedin_post"


def test_request_graph_preferences_preserve_multi_output_requests():
    workflow = {
        "nodes": [
            _node("TextGeneration-1", "TextGeneration", 520, 180),
            _node("TextGeneration-2", "TextGeneration", 520, 320),
            _node("End-1", "End", 860, 180, {"output_key": "linkedin_post"}),
            _node("End-2", "End", 860, 320, {"output_key": "x_post"}),
        ],
        "edges": [
            _edge("TextGeneration-1", "generated_text", "End-1", "end-input"),
            _edge("TextGeneration-2", "generated_text", "End-2", "end-input"),
        ],
    }

    request_text = "Turn my video into a LinkedIn post and an X post with images"
    assert _request_explicitly_mentions_multiple_outputs(request_text) is True

    _apply_request_graph_preferences(
        workflow,
        request_text=request_text,
        target_channel="linkedin",
        end_output_key="linkedin_post",
        preset_id="preset-1",
        single_output_request=False,
    )
    _apply_end_output_key_selection(
        workflow,
        end_output_key="linkedin_post",
        overwrite_all_ends=False,
    )

    end_nodes = [node for node in workflow["nodes"] if node["type"] == "End"]
    output_keys = {str(node["data"].get("output_key") or "") for node in end_nodes}

    assert len(end_nodes) == 2
    assert output_keys == {"linkedin_post", "x_post"}
