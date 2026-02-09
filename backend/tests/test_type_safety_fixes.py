"""
Tests for type safety fixes:
1. NodeExecutionResult.node_type in ExecutionLogDetail
2. BlueprintSnapshot validation in WorkflowRunOutputsResponse
"""

import pytest
from fastapi.testclient import TestClient
from uuid import uuid4
from datetime import datetime

import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.main import app
from app.api.v1.workflows import (
    ExecutionLogDetail,
    WorkflowRunOutputsResponse,
    BlueprintSnapshot,
    BlueprintSnapshotNode,
)
from app.auth.dependencies import User, get_current_user

# Test user
TEST_USER_ID = "11111111-1111-1111-1111-111111111111"

def get_test_user():
    """Test user for tests."""
    return User(sub=TEST_USER_ID, email="test@example.com", role="authenticated")

# Override authentication dependency for testing
app.dependency_overrides[get_current_user] = get_test_user

client = TestClient(app)


class TestBlueprintSnapshotValidation:
    """Test blueprint_snapshot validation in WorkflowRunOutputsResponse."""

    def test_valid_blueprint_snapshot_with_nodes(self):
        """Test that a valid blueprint snapshot with nodes validates correctly."""
        snapshot_data = {
            "nodes": [
                {"node_id": "node-1", "type": "TextGeneration"},
                {"node_id": "node-2", "type": "ImageBucket"},
            ],
            "connections": [],  # Extra fields should be ignored
            "workflow_inputs": [],  # Extra fields should be ignored
        }
        
        snapshot = BlueprintSnapshot.model_validate(snapshot_data)
        assert snapshot.nodes is not None
        assert len(snapshot.nodes) == 2
        assert snapshot.nodes[0].node_id == "node-1"
        assert snapshot.nodes[0].type == "TextGeneration"
        assert snapshot.nodes[1].node_id == "node-2"
        assert snapshot.nodes[1].type == "ImageBucket"

    def test_blueprint_snapshot_with_optional_fields(self):
        """Test that blueprint snapshot handles optional/null fields."""
        snapshot_data = {
            "nodes": [
                {"node_id": "node-1", "type": "TextGeneration"},
                {"node_id": None, "type": None},  # Null values should be allowed
                {"node_id": "node-3"},  # Missing type should be None
            ],
        }
        
        snapshot = BlueprintSnapshot.model_validate(snapshot_data)
        assert snapshot.nodes is not None
        assert len(snapshot.nodes) == 3
        assert snapshot.nodes[0].node_id == "node-1"
        assert snapshot.nodes[1].node_id is None
        assert snapshot.nodes[1].type is None
        assert snapshot.nodes[2].type is None

    def test_blueprint_snapshot_with_empty_nodes(self):
        """Test that blueprint snapshot handles empty nodes array."""
        snapshot_data = {"nodes": []}
        
        snapshot = BlueprintSnapshot.model_validate(snapshot_data)
        assert snapshot.nodes == []

    def test_blueprint_snapshot_with_null_nodes(self):
        """Test that blueprint snapshot handles null nodes."""
        snapshot_data = {"nodes": None}
        
        snapshot = BlueprintSnapshot.model_validate(snapshot_data)
        assert snapshot.nodes is None

    def test_blueprint_snapshot_with_missing_nodes(self):
        """Test that blueprint snapshot handles missing nodes field."""
        snapshot_data = {}
        
        snapshot = BlueprintSnapshot.model_validate(snapshot_data)
        assert snapshot.nodes is None

    def test_blueprint_snapshot_ignores_extra_fields(self):
        """Test that blueprint snapshot ignores extra fields from full Blueprint structure."""
        # This simulates a full Blueprint.model_dump() output
        snapshot_data = {
            "workflow_id": str(uuid4()),
            "version": 1,
            "engine_version": "1.0",
            "name": "Test Workflow",
            "description": "Test",
            "created_at": datetime.now().isoformat(),
            "created_by": TEST_USER_ID,
            "nodes": [
                {"node_id": "node-1", "type": "TextGeneration"},
            ],
            "connections": [
                {"from_node": "node-1", "from_output": "output", "to_node": "node-2", "to_input": "input"},
            ],
            "workflow_inputs": [],
            "workflow_outputs": [],
            "execution_order": ["node-1", "node-2"],
        }
        
        # Should validate successfully, ignoring extra fields
        snapshot = BlueprintSnapshot.model_validate(snapshot_data)
        assert snapshot.nodes is not None
        assert len(snapshot.nodes) == 1
        assert snapshot.nodes[0].node_id == "node-1"

    def test_blueprint_snapshot_in_workflow_run_outputs_response(self):
        """Test that WorkflowRunOutputsResponse validates blueprint_snapshot correctly."""
        response_data = {
            "execution_id": str(uuid4()),
            "workflow_id": str(uuid4()),
            "node_outputs": {"node-1": {"output": "value"}},
            "workflow_outputs": {},
            "blueprint_snapshot": {
                "nodes": [
                    {"node_id": "node-1", "type": "TextGeneration"},
                ],
            },
            "payload_bytes": 100,
            "created_at": datetime.now(),
        }
        
        response = WorkflowRunOutputsResponse.model_validate(response_data)
        assert response.blueprint_snapshot is not None
        assert response.blueprint_snapshot.nodes is not None
        assert len(response.blueprint_snapshot.nodes) == 1

    def test_workflow_run_outputs_response_with_null_blueprint_snapshot(self):
        """Test that WorkflowRunOutputsResponse handles null blueprint_snapshot."""
        response_data = {
            "execution_id": str(uuid4()),
            "workflow_id": str(uuid4()),
            "node_outputs": {},
            "workflow_outputs": {},
            "blueprint_snapshot": None,
            "payload_bytes": 0,
            "created_at": datetime.now(),
        }
        
        response = WorkflowRunOutputsResponse.model_validate(response_data)
        assert response.blueprint_snapshot is None


class TestExecutionLogDetailNodeType:
    """Test that ExecutionLogDetail handles node_type in node_summaries."""

    def test_execution_log_detail_with_node_type(self):
        """Test that ExecutionLogDetail accepts node_type in node_summaries."""
        detail_data = {
            "id": str(uuid4()),
            "workflow_id": str(uuid4()),
            "success": True,
            "error": None,
            "total_execution_time_ms": 100,
            "node_count": 1,
            "nodes_completed": 1,
            "nodes_errored": 0,
            "created_at": datetime.now(),
            "node_summaries": [
                {
                    "node_id": "node-1",
                    "node_type": "TextGeneration",
                    "status": "completed",
                    "error": None,
                    "execution_time_ms": 50,
                },
            ],
            "blueprint": None,
        }
        
        detail = ExecutionLogDetail.model_validate(detail_data)
        assert len(detail.node_summaries) == 1
        assert detail.node_summaries[0]["node_id"] == "node-1"
        assert detail.node_summaries[0]["node_type"] == "TextGeneration"

    def test_execution_log_detail_without_node_type(self):
        """Test that ExecutionLogDetail handles node_summaries without node_type (legacy data)."""
        detail_data = {
            "id": str(uuid4()),
            "workflow_id": str(uuid4()),
            "success": True,
            "error": None,
            "total_execution_time_ms": 100,
            "node_count": 1,
            "nodes_completed": 1,
            "nodes_errored": 0,
            "created_at": datetime.now(),
            "node_summaries": [
                {
                    "node_id": "node-1",
                    # node_type missing (legacy data)
                    "status": "completed",
                    "error": None,
                    "execution_time_ms": 50,
                },
            ],
            "blueprint": None,
        }
        
        detail = ExecutionLogDetail.model_validate(detail_data)
        assert len(detail.node_summaries) == 1
        assert detail.node_summaries[0]["node_id"] == "node-1"
        # node_type may be missing in legacy data, which is acceptable
        assert "node_type" not in detail.node_summaries[0] or detail.node_summaries[0].get("node_type") is None

    def test_execution_log_detail_with_null_node_type(self):
        """Test that ExecutionLogDetail handles null node_type."""
        detail_data = {
            "id": str(uuid4()),
            "workflow_id": str(uuid4()),
            "success": True,
            "error": None,
            "total_execution_time_ms": 100,
            "node_count": 1,
            "nodes_completed": 1,
            "nodes_errored": 0,
            "created_at": datetime.now(),
            "node_summaries": [
                {
                    "node_id": "node-1",
                    "node_type": None,
                    "status": "completed",
                    "error": None,
                    "execution_time_ms": 50,
                },
            ],
            "blueprint": None,
        }
        
        detail = ExecutionLogDetail.model_validate(detail_data)
        assert len(detail.node_summaries) == 1
        assert detail.node_summaries[0]["node_type"] is None
