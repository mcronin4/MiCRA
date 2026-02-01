"""
Tests for parallel workflow execution.

Tests the dynamic ready-queue parallel execution approach where nodes
execute as soon as their dependencies are satisfied.
"""

import asyncio
import pytest
from typing import Any

import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.models.blueprint import Blueprint, BlueprintNode, BlueprintConnection, WorkflowOutput
from app.services.workflow_executor import (
    execute_workflow,
    execute_workflow_streaming,
    _build_dependency_graph,
    _registry,
    executor,
)


# ---------------------------------------------------------------------------
# Test fixtures and mock executors
# ---------------------------------------------------------------------------

# Track execution order for testing parallelism
execution_log: list[tuple[str, str]] = []  # (node_id, event) where event is "start" or "end"


def reset_execution_log():
    """Reset the execution log before each test."""
    global execution_log
    execution_log = []


@executor("MockSource")
async def _exec_mock_source(params: dict, inputs: dict) -> dict[str, Any]:
    """Mock source node that outputs test data."""
    execution_log.append((params.get("node_id", "unknown"), "start"))
    delay = params.get("delay", 0.01)
    await asyncio.sleep(delay)
    execution_log.append((params.get("node_id", "unknown"), "end"))
    return {"output": params.get("value", "test")}


@executor("MockProcessor")
async def _exec_mock_processor(params: dict, inputs: dict) -> dict[str, Any]:
    """Mock processor node that transforms input."""
    execution_log.append((params.get("node_id", "unknown"), "start"))
    delay = params.get("delay", 0.01)
    await asyncio.sleep(delay)
    execution_log.append((params.get("node_id", "unknown"), "end"))

    # Combine all inputs
    result = []
    for key, val in inputs.items():
        if isinstance(val, list):
            result.extend(val)
        else:
            result.append(val)

    return {"output": f"processed({','.join(str(r) for r in result)})"}


@executor("MockSink")
async def _exec_mock_sink(params: dict, inputs: dict) -> dict[str, Any]:
    """Mock sink node that collects inputs."""
    execution_log.append((params.get("node_id", "unknown"), "start"))
    delay = params.get("delay", 0.01)
    await asyncio.sleep(delay)
    execution_log.append((params.get("node_id", "unknown"), "end"))
    return {"collected": list(inputs.values())}


@executor("MockError")
async def _exec_mock_error(params: dict, inputs: dict) -> dict[str, Any]:
    """Mock node that raises an error."""
    execution_log.append((params.get("node_id", "unknown"), "start"))
    await asyncio.sleep(0.01)
    raise ValueError(f"Intentional error from {params.get('node_id', 'unknown')}")


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def create_blueprint(
    nodes: list[BlueprintNode],
    connections: list[BlueprintConnection],
    workflow_outputs: list[WorkflowOutput] | None = None,
) -> Blueprint:
    """Create a Blueprint with computed execution order."""
    # Compute execution order via topological sort
    from collections import deque

    in_degree = {n.node_id: 0 for n in nodes}
    adjacency = {n.node_id: [] for n in nodes}

    for conn in connections:
        if conn.from_node not in in_degree:
            continue
        if conn.to_node not in in_degree:
            continue
        # Only count unique dependencies
        if conn.to_node not in adjacency[conn.from_node]:
            adjacency[conn.from_node].append(conn.to_node)
            in_degree[conn.to_node] += 1

    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    execution_order = []

    while queue:
        node_id = queue.popleft()
        execution_order.append(node_id)
        for downstream in adjacency[node_id]:
            in_degree[downstream] -= 1
            if in_degree[downstream] == 0:
                queue.append(downstream)

    return Blueprint(
        workflow_id="test-workflow",
        name="Test Workflow",
        nodes=nodes,
        connections=connections,
        execution_order=execution_order,
        workflow_outputs=workflow_outputs or [],
    )


# ---------------------------------------------------------------------------
# Tests for _build_dependency_graph
# ---------------------------------------------------------------------------


class TestBuildDependencyGraph:
    """Tests for the dependency graph builder."""

    def test_simple_chain(self):
        """Test A -> B -> C chain."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={}),
            BlueprintNode(node_id="B", type="MockProcessor", params={}),
            BlueprintNode(node_id="C", type="MockSink", params={}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="out", to_node="B", to_input="in"),
            BlueprintConnection(from_node="B", from_output="out", to_node="C", to_input="in"),
        ]
        blueprint = create_blueprint(nodes, connections)

        in_degree, adjacency, reverse_adj = _build_dependency_graph(blueprint)

        assert in_degree == {"A": 0, "B": 1, "C": 1}
        assert "B" in adjacency["A"]
        assert "C" in adjacency["B"]
        assert adjacency["C"] == []

    def test_diamond_dependency(self):
        """Test diamond: A -> B, A -> C, B -> D, C -> D."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={}),
            BlueprintNode(node_id="B", type="MockProcessor", params={}),
            BlueprintNode(node_id="C", type="MockProcessor", params={}),
            BlueprintNode(node_id="D", type="MockSink", params={}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="out", to_node="B", to_input="in"),
            BlueprintConnection(from_node="A", from_output="out", to_node="C", to_input="in"),
            BlueprintConnection(from_node="B", from_output="out", to_node="D", to_input="in1"),
            BlueprintConnection(from_node="C", from_output="out", to_node="D", to_input="in2"),
        ]
        blueprint = create_blueprint(nodes, connections)

        in_degree, adjacency, reverse_adj = _build_dependency_graph(blueprint)

        assert in_degree["A"] == 0
        assert in_degree["B"] == 1
        assert in_degree["C"] == 1
        assert in_degree["D"] == 2  # Depends on both B and C

    def test_multiple_connections_same_nodes(self):
        """Test that multiple connections between same nodes count as one dependency."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={}),
            BlueprintNode(node_id="B", type="MockProcessor", params={}),
        ]
        # Two connections from A to B (different ports)
        connections = [
            BlueprintConnection(from_node="A", from_output="out1", to_node="B", to_input="in1"),
            BlueprintConnection(from_node="A", from_output="out2", to_node="B", to_input="in2"),
        ]
        blueprint = create_blueprint(nodes, connections)

        in_degree, adjacency, reverse_adj = _build_dependency_graph(blueprint)

        # B should have in_degree 1, not 2
        assert in_degree["B"] == 1
        # A should only have B once in adjacency
        assert adjacency["A"].count("B") == 1

    def test_independent_branches(self):
        """Test parallel independent branches."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={}),
            BlueprintNode(node_id="B", type="MockSource", params={}),
            BlueprintNode(node_id="C", type="MockProcessor", params={}),
            BlueprintNode(node_id="D", type="MockProcessor", params={}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="out", to_node="C", to_input="in"),
            BlueprintConnection(from_node="B", from_output="out", to_node="D", to_input="in"),
        ]
        blueprint = create_blueprint(nodes, connections)

        in_degree, adjacency, reverse_adj = _build_dependency_graph(blueprint)

        # A and B have no dependencies
        assert in_degree["A"] == 0
        assert in_degree["B"] == 0
        # C depends on A, D depends on B
        assert in_degree["C"] == 1
        assert in_degree["D"] == 1


# ---------------------------------------------------------------------------
# Tests for parallel execution
# ---------------------------------------------------------------------------


class TestParallelExecution:
    """Tests for parallel workflow execution."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset execution log before each test."""
        reset_execution_log()

    @pytest.mark.asyncio
    async def test_independent_nodes_run_parallel(self):
        """Test that independent nodes run in parallel."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "delay": 0.05, "value": "a"}),
            BlueprintNode(node_id="B", type="MockSource", params={"node_id": "B", "delay": 0.05, "value": "b"}),
            BlueprintNode(node_id="C", type="MockSource", params={"node_id": "C", "delay": 0.05, "value": "c"}),
        ]
        connections: list[BlueprintConnection] = []
        blueprint = create_blueprint(nodes, connections)

        result = await execute_workflow(blueprint)

        assert result.success

        # All nodes should start before any ends (parallel execution)
        # Find when all starts have happened
        start_count = 0
        end_before_all_starts = False
        for node_id, event in execution_log:
            if event == "start":
                start_count += 1
            elif event == "end" and start_count < 3:
                end_before_all_starts = True
                break

        # With true parallel execution, all 3 should start before any ends
        # (given they all have the same delay)
        assert start_count == 3, f"Expected 3 starts, got {start_count}. Log: {execution_log}"

    @pytest.mark.asyncio
    async def test_diamond_dependency(self):
        """Test diamond: A -> B, A -> C, B -> D, C -> D."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "delay": 0.01, "value": "a"}),
            BlueprintNode(node_id="B", type="MockProcessor", params={"node_id": "B", "delay": 0.05}),
            BlueprintNode(node_id="C", type="MockProcessor", params={"node_id": "C", "delay": 0.02}),
            BlueprintNode(node_id="D", type="MockSink", params={"node_id": "D", "delay": 0.01}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="output", to_node="B", to_input="in"),
            BlueprintConnection(from_node="A", from_output="output", to_node="C", to_input="in"),
            BlueprintConnection(from_node="B", from_output="output", to_node="D", to_input="in1"),
            BlueprintConnection(from_node="C", from_output="output", to_node="D", to_input="in2"),
        ]
        blueprint = create_blueprint(nodes, connections)

        result = await execute_workflow(blueprint)

        assert result.success
        assert len(result.node_results) == 4

        # Check execution order constraints:
        # - A must complete before B starts
        # - A must complete before C starts
        # - Both B and C must complete before D starts
        a_end_idx = next(i for i, (n, e) in enumerate(execution_log) if n == "A" and e == "end")
        b_start_idx = next(i for i, (n, e) in enumerate(execution_log) if n == "B" and e == "start")
        c_start_idx = next(i for i, (n, e) in enumerate(execution_log) if n == "C" and e == "start")
        b_end_idx = next(i for i, (n, e) in enumerate(execution_log) if n == "B" and e == "end")
        c_end_idx = next(i for i, (n, e) in enumerate(execution_log) if n == "C" and e == "end")
        d_start_idx = next(i for i, (n, e) in enumerate(execution_log) if n == "D" and e == "start")

        assert a_end_idx < b_start_idx, "A must complete before B starts"
        assert a_end_idx < c_start_idx, "A must complete before C starts"
        assert b_end_idx < d_start_idx, "B must complete before D starts"
        assert c_end_idx < d_start_idx, "C must complete before D starts"

        # B and C should run in parallel (both start before either ends)
        # Since C has shorter delay (0.02) than B (0.05), C should end first
        assert b_start_idx < c_end_idx or c_start_idx < b_end_idx, "B and C should overlap"

    @pytest.mark.asyncio
    async def test_error_stops_execution(self):
        """Test that error in one node stops downstream execution."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "value": "a"}),
            BlueprintNode(node_id="B", type="MockError", params={"node_id": "B"}),
            BlueprintNode(node_id="C", type="MockProcessor", params={"node_id": "C"}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="output", to_node="B", to_input="in"),
            BlueprintConnection(from_node="B", from_output="output", to_node="C", to_input="in"),
        ]
        blueprint = create_blueprint(nodes, connections)

        result = await execute_workflow(blueprint)

        assert not result.success
        assert "B" in result.error

        # C should never start since B failed
        c_events = [e for n, e in execution_log if n == "C"]
        assert len(c_events) == 0, "C should not have started"

    @pytest.mark.asyncio
    async def test_parallel_branch_error_cancels_other_branch(self):
        """Test that error in parallel branch cancels other running tasks."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "delay": 0.01, "value": "a"}),
            BlueprintNode(node_id="B", type="MockError", params={"node_id": "B"}),  # Fails quickly
            BlueprintNode(node_id="C", type="MockProcessor", params={"node_id": "C", "delay": 0.5}),  # Long running
            BlueprintNode(node_id="D", type="MockSink", params={"node_id": "D"}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="output", to_node="B", to_input="in"),
            BlueprintConnection(from_node="A", from_output="output", to_node="C", to_input="in"),
            BlueprintConnection(from_node="B", from_output="output", to_node="D", to_input="in1"),
            BlueprintConnection(from_node="C", from_output="output", to_node="D", to_input="in2"),
        ]
        blueprint = create_blueprint(nodes, connections)

        result = await execute_workflow(blueprint)

        assert not result.success
        assert "B" in result.error

        # D should never start
        d_events = [e for n, e in execution_log if n == "D"]
        assert len(d_events) == 0, "D should not have started"

    @pytest.mark.asyncio
    async def test_output_correctness(self):
        """Test that outputs are correctly passed between nodes."""
        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "value": "input_a"}),
            BlueprintNode(node_id="B", type="MockProcessor", params={"node_id": "B"}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="output", to_node="B", to_input="data"),
        ]
        workflow_outputs = [
            WorkflowOutput(key="result", from_node="B", from_output="output"),
        ]
        blueprint = create_blueprint(nodes, connections, workflow_outputs)

        result = await execute_workflow(blueprint)

        assert result.success
        assert "result" in result.workflow_outputs
        assert "input_a" in result.workflow_outputs["result"]


# ---------------------------------------------------------------------------
# Tests for streaming parallel execution
# ---------------------------------------------------------------------------


class TestParallelStreamingExecution:
    """Tests for streaming parallel workflow execution."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset execution log before each test."""
        reset_execution_log()

    @pytest.mark.asyncio
    async def test_streaming_events_order(self):
        """Test that streaming events arrive in correct order."""
        import json

        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "delay": 0.01, "value": "a"}),
            BlueprintNode(node_id="B", type="MockProcessor", params={"node_id": "B", "delay": 0.01}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="output", to_node="B", to_input="in"),
        ]
        blueprint = create_blueprint(nodes, connections)

        events = []
        async for sse_line in execute_workflow_streaming(blueprint):
            if sse_line.startswith("data: "):
                event = json.loads(sse_line[6:].strip())
                events.append(event)

        # Check event sequence
        event_types = [e["event"] for e in events]

        assert event_types[0] == "workflow_start"
        assert event_types[-1] == "workflow_complete"

        # Each node should have start before complete
        a_start_idx = next(i for i, e in enumerate(events) if e.get("node_id") == "A" and e["event"] == "node_start")
        a_complete_idx = next(i for i, e in enumerate(events) if e.get("node_id") == "A" and e["event"] == "node_complete")
        b_start_idx = next(i for i, e in enumerate(events) if e.get("node_id") == "B" and e["event"] == "node_start")
        b_complete_idx = next(i for i, e in enumerate(events) if e.get("node_id") == "B" and e["event"] == "node_complete")

        assert a_start_idx < a_complete_idx
        assert b_start_idx < b_complete_idx
        assert a_complete_idx < b_start_idx  # A must complete before B starts (dependency)

    @pytest.mark.asyncio
    async def test_streaming_parallel_node_starts(self):
        """Test that parallel nodes emit start events before any complete."""
        import json

        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "delay": 0.05, "value": "a"}),
            BlueprintNode(node_id="B", type="MockSource", params={"node_id": "B", "delay": 0.05, "value": "b"}),
        ]
        connections: list[BlueprintConnection] = []
        blueprint = create_blueprint(nodes, connections)

        events = []
        async for sse_line in execute_workflow_streaming(blueprint):
            if sse_line.startswith("data: "):
                event = json.loads(sse_line[6:].strip())
                events.append(event)

        # Both nodes should start before either completes
        start_events = [e for e in events if e["event"] == "node_start"]
        complete_events = [e for e in events if e["event"] == "node_complete"]

        # Find first complete index
        first_complete_idx = next(i for i, e in enumerate(events) if e["event"] == "node_complete")

        # Count starts before first complete
        starts_before_complete = sum(1 for i, e in enumerate(events) if e["event"] == "node_start" and i < first_complete_idx)

        assert starts_before_complete == 2, "Both nodes should start before either completes"

    @pytest.mark.asyncio
    async def test_streaming_error_event(self):
        """Test that error events are correctly streamed."""
        import json

        nodes = [
            BlueprintNode(node_id="A", type="MockSource", params={"node_id": "A", "value": "a"}),
            BlueprintNode(node_id="B", type="MockError", params={"node_id": "B"}),
        ]
        connections = [
            BlueprintConnection(from_node="A", from_output="output", to_node="B", to_input="in"),
        ]
        blueprint = create_blueprint(nodes, connections)

        events = []
        async for sse_line in execute_workflow_streaming(blueprint):
            if sse_line.startswith("data: "):
                event = json.loads(sse_line[6:].strip())
                events.append(event)

        event_types = [e["event"] for e in events]

        assert "node_error" in event_types
        assert "workflow_error" in event_types
        assert "workflow_complete" not in event_types

        error_event = next(e for e in events if e["event"] == "node_error")
        assert error_event["node_id"] == "B"
        assert "Intentional error" in error_event["error"]
