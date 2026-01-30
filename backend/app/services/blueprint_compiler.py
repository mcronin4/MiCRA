"""
Blueprint compiler — transforms an editor graph into a validated, toposorted Blueprint.

Pipeline: Parse → Validate → Normalize → Toposort → Build Blueprint
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any

from app.models.blueprint import (
    Blueprint,
    BlueprintConnection,
    BlueprintNode,
    CompilationDiagnostic,
    CompilationResult,
    PortSchema,
    WorkflowOutput,
)
from app.models.node_registry import NODE_REGISTRY, get_node_spec


class CompilationError(Exception):
    """Raised when compilation fails with structured diagnostics."""

    def __init__(self, diagnostics: list[CompilationDiagnostic]):
        self.diagnostics = diagnostics
        messages = "; ".join(d.message for d in diagnostics)
        super().__init__(f"Compilation failed: {messages}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compile_workflow(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    workflow_id: str | None = None,
    version: int | None = None,
    name: str = "Untitled",
    description: str | None = None,
    created_by: str | None = None,
) -> CompilationResult:
    """
    Compile an editor graph (ReactFlow nodes + edges) into a Blueprint.

    Returns a CompilationResult with either a Blueprint or diagnostics.
    """
    diagnostics: list[CompilationDiagnostic] = []

    # 1. Parse — build lookup structures
    node_map: dict[str, dict[str, Any]] = {}
    seen_ids: set[str] = set()
    for node in nodes:
        nid = node.get("id")
        if not nid:
            diagnostics.append(CompilationDiagnostic(
                level="error", message="Node missing 'id' field"
            ))
            continue
        if nid in seen_ids:
            diagnostics.append(CompilationDiagnostic(
                level="error",
                message=f"Duplicate node ID '{nid}'",
                node_id=nid,
            ))
            continue
        seen_ids.add(nid)
        node_map[nid] = node

    if diagnostics:
        return CompilationResult(success=False, diagnostics=diagnostics)

    # Validate empty nodes list
    if not node_map:
        diagnostics.append(CompilationDiagnostic(
            level="error",
            message="Workflow must contain at least one node",
        ))
        return CompilationResult(success=False, diagnostics=diagnostics)

    # 2. Validate
    diagnostics.extend(_validate(node_map, edges))
    if any(d.level == "error" for d in diagnostics):
        return CompilationResult(success=False, diagnostics=diagnostics)

    # 3. Normalize — resolve specs, build BlueprintNodes and connections
    blueprint_nodes, connections = _normalize(node_map, edges)

    # 4. Toposort
    try:
        execution_order = _toposort(node_map, edges)
    except CompilationError as exc:
        return CompilationResult(success=False, diagnostics=exc.diagnostics)

    # 5. Build workflow outputs (no workflow inputs - bucket nodes replace Start)
    workflow_outputs = _extract_workflow_outputs(node_map, edges)

    blueprint = Blueprint(
        workflow_id=workflow_id,
        version=version,
        name=name,
        description=description,
        created_at=datetime.now(timezone.utc),
        created_by=created_by,
        nodes=blueprint_nodes,
        connections=connections,
        workflow_inputs=[],  # No workflow inputs - bucket nodes provide typed inputs
        workflow_outputs=workflow_outputs,
        execution_order=execution_order,
    )

    return CompilationResult(success=True, blueprint=blueprint, diagnostics=diagnostics)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _validate(
    node_map: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
) -> list[CompilationDiagnostic]:
    diags: list[CompilationDiagnostic] = []

    # Check every node type is registered
    for nid, node in node_map.items():
        node_type = node.get("type", "")
        if not get_node_spec(node_type):
            diags.append(CompilationDiagnostic(
                level="error",
                message=f"Unknown node type '{node_type}'",
                node_id=nid,
            ))

    # Build a set of outputs wired to each (node, input) for required-input checking
    wired_inputs: set[tuple[str, str]] = set()
    # Track which nodes have incoming connections (for bucket node validation)
    nodes_with_incoming: set[str] = set()

    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        src_handle = edge.get("sourceHandle", "")
        tgt_handle = edge.get("targetHandle", "")

        # Source node exists
        if src not in node_map:
            diags.append(CompilationDiagnostic(
                level="error",
                message=f"Edge references unknown source node '{src}'",
            ))
            continue

        # Target node exists
        if tgt not in node_map:
            diags.append(CompilationDiagnostic(
                level="error",
                message=f"Edge references unknown target node '{tgt}'",
            ))
            continue

        src_spec = get_node_spec(node_map[src].get("type", ""))
        tgt_spec = get_node_spec(node_map[tgt].get("type", ""))

        # Validate source handle exists in spec
        if src_spec and src_handle:
            valid_outputs = {p.key for p in src_spec.outputs}
            if src_handle not in valid_outputs:
                diags.append(CompilationDiagnostic(
                    level="error",
                    message=f"Node '{src}' has no output port '{src_handle}'",
                    node_id=src,
                    field=src_handle,
                ))

        # Validate target handle exists in spec
        if tgt_spec and tgt_handle:
            valid_inputs = {p.key for p in tgt_spec.inputs}
            if tgt_handle not in valid_inputs:
                diags.append(CompilationDiagnostic(
                    level="error",
                    message=f"Node '{tgt}' has no input port '{tgt_handle}'",
                    node_id=tgt,
                    field=tgt_handle,
                ))

        # Type compatibility check (strict - no JSON fallback)
        if src_spec and tgt_spec and src_handle and tgt_handle:
            src_port = next((p for p in src_spec.outputs if p.key == src_handle), None)
            tgt_port = next((p for p in tgt_spec.inputs if p.key == tgt_handle), None)
            if src_port and tgt_port:
                if not _types_compatible(src_port, tgt_port):
                    shape_note = ""
                    if src_port.runtime_type == tgt_port.runtime_type and src_port.shape != tgt_port.shape:
                        shape_note = f" Shape mismatch: {src_port.shape} -> {tgt_port.shape}."
                    diags.append(CompilationDiagnostic(
                        level="error",
                        message=(
                            f"Type/shape mismatch: {src}.{src_handle} "
                            f"({src_port.runtime_type}, {src_port.shape}) -> "
                            f"{tgt}.{tgt_handle} ({tgt_port.runtime_type}, {tgt_port.shape})."
                            f"{shape_note}"
                        ),
                        node_id=tgt,
                        field=tgt_handle,
                    ))

        wired_inputs.add((tgt, tgt_handle))
        nodes_with_incoming.add(tgt)

    # Validate no multiple connections to same input port
    input_connections: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for edge in edges:
        tgt = edge.get("target")
        tgt_handle = edge.get("targetHandle", "")
        if tgt in node_map:
            input_connections[(tgt, tgt_handle)].append(edge)
    
    for (node_id, input_key), conns in input_connections.items():
        if len(conns) > 1:
            diags.append(CompilationDiagnostic(
                level="error",
                message=f"Multiple edges connect to input '{input_key}' of node '{node_id}' (only one connection per input allowed)",
                node_id=node_id,
                field=input_key,
            ))

    # Check required inputs are wired
    for nid, node in node_map.items():
        spec = get_node_spec(node.get("type", ""))
        if not spec:
            continue
        for port in spec.inputs:
            if port.required and (nid, port.key) not in wired_inputs:
                diags.append(CompilationDiagnostic(
                    level="error",
                    message=f"Required input '{port.key}' is not connected",
                    node_id=nid,
                    field=port.key,
                ))

    # Validate bucket nodes don't have incoming connections (they're sources)
    bucket_node_types = {"ImageBucket", "AudioBucket", "VideoBucket", "TextBucket"}
    for nid, node in node_map.items():
        node_type = node.get("type", "")
        if node_type in bucket_node_types:
            if nid in nodes_with_incoming:
                diags.append(CompilationDiagnostic(
                    level="error",
                    message=f"Bucket node '{nid}' cannot have incoming connections (bucket nodes are sources)",
                    node_id=nid,
                ))

    return diags


def _types_compatible(src: PortSchema, tgt: PortSchema) -> bool:
    """
    Check if two ports are type-compatible.

    Type compatibility rules:
    - Runtime types must match exactly (strict, no JSON fallback)
    - Special case: VideoRef can connect to AudioRef (video contains audio track)

    Shape compatibility rules (for matching runtime types):
    - list → single: ALLOWED (automatic conversion at runtime)
      * For Text: joins items with "\n\n"
      * For other types: takes first item (warns if multiple)
    - single → list: ALLOWED (automatic conversion at runtime)
      * Wraps single value in list
    - same shape: ALWAYS ALLOWED

    Note: Shape conversion happens automatically in resolve_node_inputs() during execution.
    This check ensures the conversion is safe and expected.
    """
    # Runtime type compatibility.
    # Special case: JSON is treated as an "any" sink type — any source
    # runtime_type can flow into a JSON target, as long as shapes are compatible.
    if tgt.runtime_type != "JSON":
        # Strict type matching for non-JSON targets
        if src.runtime_type != tgt.runtime_type:
            # Special case: VideoRef can connect to AudioRef
            # (video files contain audio tracks that can be extracted/transcribed)
            if not (src.runtime_type == "VideoRef" and tgt.runtime_type == "AudioRef"):
                return False
    
    # Check shape compatibility:
    # - list -> single: allowed (can take first item or join)
    # - single -> list: allowed (can wrap in list)
    # - same shape: always allowed
    if src.shape == tgt.shape:
        return True
    if src.shape == "list" and tgt.shape == "single":
        return True  # List can be converted to single (take first or join)
    if src.shape == "single" and tgt.shape == "list":
        return True  # Single can be converted to list (wrap)
    
    return False


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def _normalize(
    node_map: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
) -> tuple[list[BlueprintNode], list[BlueprintConnection]]:
    blueprint_nodes: list[BlueprintNode] = []

    for nid, node in node_map.items():
        node_type = node.get("type", "")
        spec = get_node_spec(node_type)

        # Extract params from node data (strip UI-only fields)
        raw_data = node.get("data", {}) or {}
        params = {k: v for k, v in raw_data.items() if k not in ("label",)}

        blueprint_nodes.append(BlueprintNode(
            node_id=nid,
            type=node_type,
            implementation=spec.default_implementation if spec else None,
            params=params,
            inputs_schema=list(spec.inputs) if spec else [],
            outputs_schema=list(spec.outputs) if spec else [],
        ))

    connections: list[BlueprintConnection] = []
    for edge in edges:
        connections.append(BlueprintConnection(
            from_node=edge.get("source", ""),
            from_output=edge.get("sourceHandle", ""),
            to_node=edge.get("target", ""),
            to_input=edge.get("targetHandle", ""),
        ))

    return blueprint_nodes, connections


# ---------------------------------------------------------------------------
# Toposort (Kahn's algorithm)
# ---------------------------------------------------------------------------

def _toposort(
    node_map: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
) -> list[str]:
    in_degree: dict[str, int] = {nid: 0 for nid in node_map}
    adjacency: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        src = edge.get("source", "")
        tgt = edge.get("target", "")
        if src in node_map and tgt in node_map:
            adjacency[src].append(tgt)
            in_degree[tgt] += 1

    queue: deque[str] = deque(nid for nid, deg in in_degree.items() if deg == 0)
    order: list[str] = []

    while queue:
        nid = queue.popleft()
        order.append(nid)
        for neighbor in adjacency[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(order) != len(node_map):
        cycle_nodes = [nid for nid, deg in in_degree.items() if deg > 0]
        raise CompilationError([
            CompilationDiagnostic(
                level="error",
                message=f"Cycle detected involving nodes: {', '.join(cycle_nodes)}",
            )
        ])

    return order


# ---------------------------------------------------------------------------
# Workflow inputs / outputs extraction
# ---------------------------------------------------------------------------

def _extract_workflow_outputs(
    node_map: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
) -> list[WorkflowOutput]:
    """End node inputs become workflow outputs; trace back to find source."""
    outputs: list[WorkflowOutput] = []
    for nid, node in node_map.items():
        if node.get("type") == "End":
            spec = get_node_spec("End")
            if not spec:
                continue
            for port in spec.inputs:
                # Find the edge feeding this input
                feeding_edge = next(
                    (e for e in edges
                     if e.get("target") == nid and e.get("targetHandle") == port.key),
                    None,
                )
                if feeding_edge:
                    outputs.append(WorkflowOutput(
                        key=port.key,
                        from_node=feeding_edge["source"],
                        from_output=feeding_edge.get("sourceHandle", ""),
                    ))
    return outputs
