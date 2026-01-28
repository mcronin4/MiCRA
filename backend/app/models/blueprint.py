"""
Blueprint models — the compiled, execution-ready representation of a workflow.

Blueprints are produced on-demand by the compiler and are NOT persisted.
They contain toposorted execution order, validated port schemas, and
resolved node implementations.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


RuntimeType = Literal["Text", "ImageRef", "VideoRef", "AudioRef", "JSON"]
RuntimeShape = Literal["single", "list", "map"]


class PortSchema(BaseModel):
    key: str
    runtime_type: RuntimeType
    shape: RuntimeShape = "single"
    required: bool = True


class BlueprintNode(BaseModel):
    node_id: str
    type: str
    implementation: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    inputs_schema: list[PortSchema] = Field(default_factory=list)
    outputs_schema: list[PortSchema] = Field(default_factory=list)
    runtime_hints: dict[str, Any] | None = None


class BlueprintConnection(BaseModel):
    from_node: str
    from_output: str
    to_node: str
    to_input: str


class WorkflowInput(BaseModel):
    key: str
    runtime_type: RuntimeType
    shape: RuntimeShape = "single"


class WorkflowOutput(BaseModel):
    key: str
    from_node: str
    from_output: str


class Blueprint(BaseModel):
    workflow_id: str | None = None
    version: int | None = None
    engine_version: str = "1.0"
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str | None = None
    nodes: list[BlueprintNode]
    connections: list[BlueprintConnection]
    workflow_inputs: list[WorkflowInput] = Field(default_factory=list)
    workflow_outputs: list[WorkflowOutput] = Field(default_factory=list)
    execution_order: list[str]


class CompilationDiagnostic(BaseModel):
    level: Literal["error", "warning"]
    message: str
    node_id: str | None = None
    field: str | None = None


class CompilationResult(BaseModel):
    success: bool
    blueprint: Blueprint | None = None
    diagnostics: list[CompilationDiagnostic] = Field(default_factory=list)
