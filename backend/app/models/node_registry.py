"""
Node type registry — source of truth for what each node type accepts and produces.

Maps editor node type strings to their canonical port schemas, default
implementations, and default parameters.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.models.blueprint import PortSchema


class NodeTypeSpec(BaseModel):
    inputs: list[PortSchema]
    outputs: list[PortSchema]
    default_implementation: str | None = None
    default_params: dict = {}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
# Keys match the ReactFlow node `type` values used in the editor.
# Handle IDs come from the frontend NodeConfig / Handle definitions.

NODE_REGISTRY: dict[str, NodeTypeSpec] = {
    # ---- Flow nodes ----
    "End": NodeTypeSpec(
        inputs=[
            PortSchema(key="end-input", runtime_type="JSON", shape="single"),
        ],
        outputs=[],
    ),

    # ---- Input bucket nodes ----
    "ImageBucket": NodeTypeSpec(
        inputs=[],
        outputs=[
            PortSchema(key="images", runtime_type="ImageRef", shape="list"),
        ],
    ),
    "AudioBucket": NodeTypeSpec(
        inputs=[],
        outputs=[
            PortSchema(key="audio", runtime_type="AudioRef", shape="list"),
        ],
    ),
    "VideoBucket": NodeTypeSpec(
        inputs=[],
        outputs=[
            PortSchema(key="videos", runtime_type="VideoRef", shape="list"),
        ],
    ),
    "TextBucket": NodeTypeSpec(
        inputs=[],
        outputs=[
            PortSchema(key="text", runtime_type="Text", shape="list"),
        ],
    ),

    # ---- Workflow nodes ----
    "TextGeneration": NodeTypeSpec(
        inputs=[
            PortSchema(key="text", runtime_type="Text", shape="single"),
        ],
        outputs=[
            PortSchema(key="generated_text", runtime_type="JSON", shape="single"),
        ],
        default_implementation="fireworks:llama-v3p1",
    ),
    "ImageGeneration": NodeTypeSpec(
        inputs=[
            PortSchema(key="prompt", runtime_type="Text", shape="single"),
            PortSchema(key="image", runtime_type="ImageRef", shape="single", required=False),
        ],
        outputs=[
            PortSchema(key="generated_image", runtime_type="ImageRef", shape="single"),
        ],
    ),
    "ImageMatching": NodeTypeSpec(
        inputs=[
            PortSchema(key="images", runtime_type="ImageRef", shape="list"),
            PortSchema(key="text", runtime_type="Text", shape="single"),
        ],
        outputs=[
            PortSchema(key="matches", runtime_type="JSON", shape="single"),
        ],
    ),
    "Transcription": NodeTypeSpec(
        inputs=[
            PortSchema(key="audio", runtime_type="AudioRef", shape="single"),
        ],
        outputs=[
            PortSchema(key="transcription", runtime_type="Text", shape="single"),
        ],
    ),
    "TextSummarization": NodeTypeSpec(
        inputs=[
            PortSchema(key="text", runtime_type="Text", shape="single"),
        ],
        outputs=[
            PortSchema(key="summary", runtime_type="Text", shape="single"),
        ],
    ),
    "ImageExtraction": NodeTypeSpec(
        inputs=[
            PortSchema(key="source", runtime_type="VideoRef", shape="single"),
        ],
        outputs=[
            PortSchema(key="images", runtime_type="ImageRef", shape="list"),
        ],
    ),
}


def get_node_spec(node_type: str) -> NodeTypeSpec | None:
    """Look up a node type spec, returning None if unknown."""
    return NODE_REGISTRY.get(node_type)
