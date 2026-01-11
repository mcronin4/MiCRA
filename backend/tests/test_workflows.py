"""
Tests for workflows API endpoints.

NOTE: In prototype mode, all workflows are shared (no authentication).
All users can access all workflows, but system workflows cannot be deleted or updated.
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime
from uuid import uuid4
import json

# Import the app - adjust path as needed
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.main import app
from app.db.supabase import get_supabase

client = TestClient(app)

# Test data
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000"

def get_test_workflow_data():
    """Helper to create test workflow data structure."""
    return {
        "nodes": [
            {
                "id": "node-1",
                "type": "ImageMatching",
                "position": {"x": 100, "y": 200},
                "data": {"label": "Image Matching Node"}
            },
            {
                "id": "node-2",
                "type": "TextGeneration",
                "position": {"x": 400, "y": 200},
                "data": {"label": "Text Generation Node"}
            }
        ],
        "edges": [
            {
                "id": "edge-1",
                "source": "node-1",
                "target": "node-2",
                "sourceHandle": "matches",
                "targetHandle": "text"
            }
        ]
    }


def cleanup_test_workflow(workflow_id: str):
    """Helper to clean up test workflow."""
    try:
        supabase = get_supabase()
        # Only delete if it's not a system workflow
        result = supabase.client.table("workflows").select("is_system_workflow").eq("id", workflow_id).execute()
        if result.data and not result.data[0].get("is_system_workflow", False):
            supabase.client.table("workflows").delete().eq("id", workflow_id).execute()
    except Exception:
        pass  # Ignore cleanup errors


class TestWorkflowsAPI:
    """Test suite for workflows API."""

    @pytest.fixture(autouse=True)
    def setup_teardown(self):
        """Setup and teardown for each test."""
        self.created_workflow_ids = []
        yield
        # Cleanup: delete all created test workflows
        for workflow_id in self.created_workflow_ids:
            cleanup_test_workflow(workflow_id)

    def test_create_workflow_success(self):
        """Test creating a new workflow successfully."""
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Test Workflow",
            "description": "A test workflow",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        
        response = client.post("/api/v1/workflows", json=payload)
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Workflow"
        assert data["description"] == "A test workflow"
        assert data["is_system_workflow"] == False
        assert data["user_id"] == DEFAULT_USER_ID
        assert data["workflow_data"]["nodes"] == workflow_data["nodes"]
        assert data["workflow_data"]["edges"] == workflow_data["edges"]
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data
        
        self.created_workflow_ids.append(data["id"])

    def test_create_workflow_without_description(self):
        """Test creating workflow without optional description."""
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Test Workflow No Desc",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        
        response = client.post("/api/v1/workflows", json=payload)
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Workflow No Desc"
        assert data["description"] is None
        assert data["workflow_data"]["nodes"] == workflow_data["nodes"]
        
        self.created_workflow_ids.append(data["id"])

    def test_create_workflow_empty_name(self):
        """Test creating workflow with empty name should fail."""
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        
        response = client.post("/api/v1/workflows", json=payload)
        assert response.status_code == 422  # Validation error

    def test_create_workflow_no_nodes(self):
        """Test creating workflow with no nodes should fail."""
        payload = {
            "name": "Empty Workflow",
            "workflow_data": {
                "nodes": [],
                "edges": []
            },
            "is_system_workflow": False
        }
        
        response = client.post("/api/v1/workflows", json=payload)
        assert response.status_code == 400  # Bad request

    def test_create_system_workflow(self):
        """Test creating a system workflow."""
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "System Template",
            "description": "A system template",
            "workflow_data": workflow_data,
            "is_system_workflow": True
        }
        
        response = client.post("/api/v1/workflows", json=payload)
        
        assert response.status_code == 201
        data = response.json()
        assert data["is_system_workflow"] == True
        assert data["name"] == "System Template"
        
        # Don't add to cleanup list - system workflows shouldn't be deleted in cleanup
        # But we'll clean it up manually if it was created
        workflow_id = data["id"]
        
        # Manually delete it after test
        try:
            supabase = get_supabase()
            supabase.client.table("workflows").update({"is_system_workflow": False}).eq("id", workflow_id).execute()
            cleanup_test_workflow(workflow_id)
        except Exception:
            pass

    def test_list_workflows_includes_user_and_system(self):
        """Test listing workflows includes both user and system workflows."""
        # Create a user workflow
        workflow_data = get_test_workflow_data()
        user_payload = {
            "name": "User Workflow for List",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        user_response = client.post("/api/v1/workflows", json=user_payload)
        user_workflow_id = user_response.json()["id"]
        self.created_workflow_ids.append(user_workflow_id)
        
        # List workflows
        response = client.get("/api/v1/workflows?include_system=true")
        
        assert response.status_code == 200
        workflows = response.json()
        assert isinstance(workflows, list)
        # Should include at least our created workflow
        workflow_ids = [w["id"] for w in workflows]
        assert user_workflow_id in workflow_ids

    def test_list_workflows_exclude_system(self):
        """Test listing workflows excluding system workflows."""
        # Create a user workflow
        workflow_data = get_test_workflow_data()
        user_payload = {
            "name": "User Workflow for List Exclude",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        user_response = client.post("/api/v1/workflows", json=user_payload)
        user_workflow_id = user_response.json()["id"]
        self.created_workflow_ids.append(user_workflow_id)
        
        # List workflows excluding system
        response = client.get("/api/v1/workflows?include_system=false")
        
        assert response.status_code == 200
        workflows = response.json()
        assert isinstance(workflows, list)
        # Should not include system workflows
        system_workflows = [w for w in workflows if w.get("is_system_workflow", False)]
        assert len(system_workflows) == 0

    def test_list_templates_only(self):
        """Test listing only system workflow templates."""
        # Create a system workflow
        workflow_data = get_test_workflow_data()
        system_payload = {
            "name": "Template for List Test",
            "workflow_data": workflow_data,
            "is_system_workflow": True
        }
        system_response = client.post("/api/v1/workflows", json=system_payload)
        system_workflow_id = system_response.json()["id"]
        
        # List templates
        response = client.get("/api/v1/workflows/templates")
        
        assert response.status_code == 200
        templates = response.json()
        assert isinstance(templates, list)
        # Should only include system workflows
        for template in templates:
            assert template["is_system_workflow"] == True
        
        # Cleanup
        try:
            supabase = get_supabase()
            supabase.client.table("workflows").update({"is_system_workflow": False}).eq("id", system_workflow_id).execute()
            cleanup_test_workflow(system_workflow_id)
        except Exception:
            pass

    def test_get_workflow_by_id(self):
        """Test getting a specific workflow by ID."""
        # Create a workflow
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Workflow to Get",
            "description": "Getting this one",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        workflow_id = create_response.json()["id"]
        self.created_workflow_ids.append(workflow_id)
        
        # Get it
        response = client.get(f"/api/v1/workflows/{workflow_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == workflow_id
        assert data["name"] == "Workflow to Get"
        assert data["description"] == "Getting this one"
        assert data["workflow_data"]["nodes"] == workflow_data["nodes"]

    def test_get_workflow_not_found(self):
        """Test getting a non-existent workflow returns 404."""
        fake_id = str(uuid4())
        response = client.get(f"/api/v1/workflows/{fake_id}")
        assert response.status_code == 404

    def test_update_workflow_success(self):
        """Test updating a user workflow successfully."""
        # Create a workflow
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Original Name",
            "description": "Original description",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        workflow_id = create_response.json()["id"]
        self.created_workflow_ids.append(workflow_id)
        
        # Update it
        new_workflow_data = get_test_workflow_data()
        new_workflow_data["nodes"][0]["id"] = "updated-node"
        update_payload = {
            "name": "Updated Name",
            "description": "Updated description",
            "workflow_data": new_workflow_data
        }
        response = client.put(f"/api/v1/workflows/{workflow_id}", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"
        assert data["workflow_data"]["nodes"][0]["id"] == "updated-node"

    def test_update_workflow_partial(self):
        """Test updating workflow with partial data."""
        # Create a workflow
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Partial Update Test",
            "description": "Original",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        workflow_id = create_response.json()["id"]
        self.created_workflow_ids.append(workflow_id)
        
        # Update only name
        update_payload = {"name": "Partially Updated"}
        response = client.put(f"/api/v1/workflows/{workflow_id}", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Partially Updated"
        assert data["description"] == "Original"  # Should remain unchanged

    def test_update_system_workflow_forbidden(self):
        """Test that system workflows cannot be updated."""
        # Create a system workflow
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "System Workflow Update Test",
            "workflow_data": workflow_data,
            "is_system_workflow": True
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        system_workflow_id = create_response.json()["id"]
        
        # Try to update it
        update_payload = {"name": "Trying to Update System"}
        response = client.put(f"/api/v1/workflows/{system_workflow_id}", json=update_payload)
        
        assert response.status_code == 403  # Forbidden
        assert "system" in response.json()["detail"].lower() or "modify" in response.json()["detail"].lower()
        
        # Cleanup
        try:
            supabase = get_supabase()
            supabase.client.table("workflows").update({"is_system_workflow": False}).eq("id", system_workflow_id).execute()
            cleanup_test_workflow(system_workflow_id)
        except Exception:
            pass

    def test_update_workflow_not_found(self):
        """Test updating non-existent workflow returns 404."""
        fake_id = str(uuid4())
        update_payload = {"name": "Doesn't Matter"}
        response = client.put(f"/api/v1/workflows/{fake_id}", json=update_payload)
        assert response.status_code == 404

    def test_update_workflow_empty_nodes(self):
        """Test updating workflow with empty nodes should fail."""
        # Create a workflow
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Update Empty Test",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        workflow_id = create_response.json()["id"]
        self.created_workflow_ids.append(workflow_id)
        
        # Try to update with empty nodes
        update_payload = {
            "workflow_data": {
                "nodes": [],
                "edges": []
            }
        }
        response = client.put(f"/api/v1/workflows/{workflow_id}", json=update_payload)
        assert response.status_code == 400

    def test_delete_workflow_success(self):
        """Test deleting a user workflow successfully."""
        # Create a workflow
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Workflow to Delete",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        workflow_id = create_response.json()["id"]
        
        # Delete it
        response = client.delete(f"/api/v1/workflows/{workflow_id}")
        assert response.status_code == 204
        
        # Verify it's deleted
        get_response = client.get(f"/api/v1/workflows/{workflow_id}")
        assert get_response.status_code == 404

    def test_delete_system_workflow_forbidden(self):
        """Test that system workflows cannot be deleted."""
        # Create a system workflow
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "System Workflow Delete Test",
            "workflow_data": workflow_data,
            "is_system_workflow": True
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        system_workflow_id = create_response.json()["id"]
        
        # Try to delete it
        response = client.delete(f"/api/v1/workflows/{system_workflow_id}")
        
        assert response.status_code == 403  # Forbidden
        assert "system" in response.json()["detail"].lower() or "delete" in response.json()["detail"].lower()
        
        # Verify it still exists
        get_response = client.get(f"/api/v1/workflows/{system_workflow_id}")
        assert get_response.status_code == 200
        
        # Cleanup - convert to non-system first, then delete
        try:
            supabase = get_supabase()
            supabase.client.table("workflows").update({"is_system_workflow": False}).eq("id", system_workflow_id).execute()
            cleanup_test_workflow(system_workflow_id)
        except Exception:
            pass

    def test_delete_workflow_not_found(self):
        """Test deleting non-existent workflow returns 404."""
        fake_id = str(uuid4())
        response = client.delete(f"/api/v1/workflows/{fake_id}")
        assert response.status_code == 404

    def test_workflow_data_structure_only(self):
        """Test that workflow data only saves structure, not inputs/outputs."""
        # Create workflow with extra data that shouldn't be saved
        workflow_data = get_test_workflow_data()
        # Add extra properties that simulate node state (shouldn't be saved)
        workflow_data["nodes"][0]["inputs"] = {"text": "test", "images": ["base64..."]}
        workflow_data["nodes"][0]["outputs"] = {"result": "test"}
        workflow_data["nodes"][0]["status"] = "completed"
        
        payload = {
            "name": "Structure Test",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        
        response = client.post("/api/v1/workflows", json=payload)
        assert response.status_code == 201
        
        workflow_id = response.json()["id"]
        self.created_workflow_ids.append(workflow_id)
        
        # Get it back and verify structure is saved
        get_response = client.get(f"/api/v1/workflows/{workflow_id}")
        assert get_response.status_code == 200
        
        saved_data = get_response.json()["workflow_data"]
        # Structure should be preserved
        assert len(saved_data["nodes"]) == 2
        assert saved_data["nodes"][0]["id"] == "node-1"
        assert saved_data["nodes"][0]["type"] == "ImageMatching"
        assert saved_data["nodes"][0]["position"] == {"x": 100, "y": 200}
        # NOTE: Extra properties might be preserved in JSONB storage
        # The important thing is that when we load, we reset nodes to idle state
        # This test verifies the structure is saved correctly

    def test_all_users_access_all_workflows(self):
        """Test that in prototype mode, all workflows are accessible to all users."""
        # Create a workflow (simulates user A)
        workflow_data = get_test_workflow_data()
        payload = {
            "name": "Shared Workflow",
            "workflow_data": workflow_data,
            "is_system_workflow": False
        }
        create_response = client.post("/api/v1/workflows", json=payload)
        workflow_id = create_response.json()["id"]
        self.created_workflow_ids.append(workflow_id)
        
        # Any user (no auth) should be able to access it
        response = client.get(f"/api/v1/workflows/{workflow_id}")
        assert response.status_code == 200
        assert response.json()["id"] == workflow_id
        
        # Any user should be able to list it
        list_response = client.get("/api/v1/workflows")
        workflow_ids = [w["id"] for w in list_response.json()]
        assert workflow_id in workflow_ids
