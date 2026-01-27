"""
Workflow persistence API endpoints.

NOTE: This system only saves workflow structure (nodes, edges, positions).
Node inputs/outputs, attachments (e.g., base64 images), and execution state
are NOT persisted. All workflows load with nodes in 'idle' state with empty inputs.

In prototype mode (no authentication), all workflows are accessible to all users.
System workflows (is_system=True) cannot be deleted or updated.

Workflow data is stored in workflow_versions table. The workflows table stores metadata only.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from app.db.supabase import get_supabase

router = APIRouter(prefix="/workflows", tags=["workflows"])

# Default user ID for anonymous users (until auth is implemented)
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000"


class WorkflowData(BaseModel):
    """Workflow structure - only nodes and edges, no data/attachments."""
    nodes: List[Dict[str, Any]] = Field(..., description="ReactFlow nodes (structure only)")
    edges: List[Dict[str, Any]] = Field(..., description="ReactFlow edges (connections)")


class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    workflow_data: WorkflowData
    is_system: bool = False


class WorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    workflow_data: Optional[WorkflowData] = None


class WorkflowMetadataResponse(BaseModel):
    """Lightweight workflow metadata without payload."""
    id: str
    name: str
    description: Optional[str]
    user_id: str
    is_system: bool
    node_count: int
    edge_count: int
    created_at: datetime
    updated_at: datetime


class WorkflowResponse(BaseModel):
    """Full workflow response with payload."""
    id: str
    name: str
    description: Optional[str]
    user_id: str
    is_system: bool
    workflow_data: WorkflowData
    created_at: datetime
    updated_at: datetime


def get_latest_version(supabase, workflow_id: str) -> Optional[Dict[str, Any]]:
    """Get the latest version for a workflow."""
    result = supabase.table("workflow_versions")\
        .select("*")\
        .eq("workflow_id", workflow_id)\
        .order("version_number", desc=True)\
        .limit(1)\
        .execute()
    
    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


def get_latest_versions_batch(supabase, workflow_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Get the latest version for multiple workflows. Returns dict mapping workflow_id to version."""
    if not workflow_ids:
        return {}
    
    # Get all versions for these workflows, ordered by version_number desc
    result = supabase.table("workflow_versions")\
        .select("*")\
        .in_("workflow_id", workflow_ids)\
        .order("workflow_id")\
        .order("version_number", desc=True)\
        .execute()
    
    # Build a dict, keeping only the first (latest) version for each workflow_id
    versions = {}
    seen_workflows = set()
    for version in result.data:
        workflow_id = version["workflow_id"]
        if workflow_id not in seen_workflows:
            versions[workflow_id] = version
            seen_workflows.add(workflow_id)
    
    return versions


@router.get("", response_model=List[WorkflowMetadataResponse])
async def list_workflows(user_id: Optional[str] = None):
    """
    List workflows for the current user (non-system workflows only).
    Returns only metadata (no payload) for efficient listing.
    
    System workflows/templates should be fetched via /templates endpoint.
    
    Args:
        user_id: Filter by user ID. If None, returns workflows for current user.
                 In prototype mode without auth, uses DEFAULT_USER_ID.
    """
    try:
        supabase = get_supabase().client
        
        # Determine which user's workflows to fetch
        # TODO: When auth is fully implemented, get user_id from JWT token
        target_user_id = user_id if user_id else DEFAULT_USER_ID
        
        # Query workflows: only user's workflows (not system workflows)
        query = supabase.table("workflows")\
            .select("*")\
            .eq("user_id", target_user_id)\
            .eq("is_system", False)\
            .order("updated_at", desc=True)
        
        result = query.execute()
        
        if not result.data:
            return []
        
        # Get workflow IDs and fetch latest versions to get node/edge counts
        workflow_ids = [str(item["id"]) for item in result.data]
        latest_versions = get_latest_versions_batch(supabase, workflow_ids)
        
        workflows = []
        for item in result.data:
            workflow_id = str(item["id"])
            version = latest_versions.get(workflow_id)
            
            if not version:
                # Skip workflows without versions
                continue
            
            payload = version["payload"]
            node_count = len(payload.get("nodes", []))
            edge_count = len(payload.get("edges", []))
            
            workflows.append(WorkflowMetadataResponse(
                id=workflow_id,
                name=item["name"],
                description=item.get("description"),
                user_id=str(item["user_id"]) if item.get("user_id") else "",
                is_system=False,
                node_count=node_count,
                edge_count=edge_count,
                created_at=item["created_at"],
                updated_at=item["updated_at"]
            ))
        
        return workflows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list workflows: {str(e)}")


@router.get("/templates", response_model=List[WorkflowMetadataResponse])
async def list_templates():
    """Get only pre-built system workflow templates. Returns only metadata (no payload)."""
    try:
        supabase = get_supabase().client
        
        # Query for system workflows: is_system = True OR user_id IS NULL
        # System workflows should have NULL user_id per schema, but handle both cases
        result = supabase.table("workflows")\
            .select("*")\
            .eq("is_system", True)\
            .order("name")\
            .execute()
        
        if not result.data:
            return []
        
        # Get workflow IDs and fetch latest versions to get node/edge counts
        workflow_ids = [str(item["id"]) for item in result.data]
        
        if not workflow_ids:
            return []
        
        latest_versions = get_latest_versions_batch(supabase, workflow_ids)
        
        templates = []
        for item in result.data:
            workflow_id = str(item["id"])
            version = latest_versions.get(workflow_id)
            
            if not version:
                # Skip workflows without versions
                continue
            
            payload = version["payload"]
            node_count = len(payload.get("nodes", []))
            edge_count = len(payload.get("edges", []))
            
            templates.append(WorkflowMetadataResponse(
                id=workflow_id,
                name=item["name"],
                description=item.get("description"),
                user_id=str(item["user_id"]) if item.get("user_id") else "",
                is_system=True,
                node_count=node_count,
                edge_count=edge_count,
                created_at=item["created_at"],
                updated_at=item["updated_at"]
            ))
        
        return templates
    except Exception as e:
        import traceback
        error_detail = f"Failed to list templates: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=error_detail)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: str):
    """
    Get a specific workflow by ID.
    In prototype mode: all workflows are accessible to all users.
    """
    try:
        supabase = get_supabase().client
        
        result = supabase.table("workflows")\
            .select("*")\
            .eq("id", workflow_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        item = result.data[0]
        
        # Get latest version
        version = get_latest_version(supabase, workflow_id)
        if not version:
            raise HTTPException(status_code=404, detail="Workflow version not found")
        
        return WorkflowResponse(
            id=str(item["id"]),
            name=item["name"],
            description=item.get("description"),
            user_id=str(item["user_id"]) if item.get("user_id") else "",
            is_system=item.get("is_system", False),
            workflow_data=WorkflowData(**version["payload"]),
            created_at=item["created_at"],
            updated_at=item["updated_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get workflow: {str(e)}")


@router.post("", response_model=WorkflowResponse, status_code=201)
async def create_workflow(workflow: WorkflowCreate):
    """
    Create a new workflow.
    In prototype mode: all workflows are created with DEFAULT_USER_ID.
    Creates workflow metadata and initial version.
    """
    try:
        supabase = get_supabase().client
        
        # Validate workflow data structure
        if not workflow.workflow_data.nodes:
            raise HTTPException(status_code=400, detail="Workflow must contain at least one node")
        
        # Create workflow metadata
        # System workflows should have NULL user_id per schema
        workflow_data = {
            "name": workflow.name,
            "description": workflow.description,
            "user_id": None if workflow.is_system else DEFAULT_USER_ID,
            "is_system": workflow.is_system,
        }
        
        result = supabase.table("workflows").insert(workflow_data).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create workflow")
        
        item = result.data[0]
        workflow_id = str(item["id"])
        
        # Create initial version (version_number will be auto-incremented to 1)
        version_data = {
            "workflow_id": workflow_id,
            "payload": workflow.workflow_data.model_dump()
        }
        
        version_result = supabase.table("workflow_versions").insert(version_data).execute()
        
        if not version_result.data or len(version_result.data) == 0:
            # Rollback: delete the workflow if version creation fails
            supabase.table("workflows").delete().eq("id", workflow_id).execute()
            raise HTTPException(status_code=500, detail="Failed to create workflow version")
        
        return WorkflowResponse(
            id=workflow_id,
            name=item["name"],
            description=item.get("description"),
            user_id=str(item["user_id"]) if item.get("user_id") else "",
            is_system=item.get("is_system", False),
            workflow_data=workflow.workflow_data,
            created_at=item["created_at"],
            updated_at=item["updated_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create workflow: {str(e)}")


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: str, workflow: WorkflowUpdate):
    """
    Update an existing workflow.
    Cannot update system workflows (is_system=True).
    In prototype mode: all non-system workflows can be updated by anyone.
    When updating workflow_data, saves current version to workflow_versions and creates new version.
    """
    try:
        supabase = get_supabase().client
        
        # Check if workflow exists
        existing = supabase.table("workflows")\
            .select("*")\
            .eq("id", workflow_id)\
            .execute()
        
        if not existing.data or len(existing.data) == 0:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        existing_workflow = existing.data[0]
        
        # Cannot update system workflows
        if existing_workflow.get("is_system", False):
            raise HTTPException(status_code=403, detail="Cannot modify system workflows")
        
        # If workflow_data is being updated, we need to save current version first
        if workflow.workflow_data is not None:
            # Validate workflow data if provided
            if not workflow.workflow_data.nodes:
                raise HTTPException(status_code=400, detail="Workflow must contain at least one node")
            
            # Get current version to save it (the trigger will auto-increment, so we're creating a new version)
            # The current version is already saved, we just need to create a new one
            version_data = {
                "workflow_id": workflow_id,
                "payload": workflow.workflow_data.model_dump()
            }
            
            version_result = supabase.table("workflow_versions").insert(version_data).execute()
            
            if not version_result.data or len(version_result.data) == 0:
                raise HTTPException(status_code=500, detail="Failed to create workflow version")
        
        # Build update data for workflow metadata
        update_data = {}
        if workflow.name is not None:
            update_data["name"] = workflow.name
        if workflow.description is not None:
            update_data["description"] = workflow.description
        
        # Validate that at least one field is being updated
        if not update_data and workflow.workflow_data is None:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        # Update workflow metadata if needed
        if update_data:
            result = supabase.table("workflows")\
                .update(update_data)\
                .eq("id", workflow_id)\
                .execute()
            
            if not result.data or len(result.data) == 0:
                raise HTTPException(status_code=500, detail="Failed to update workflow")
            
            item = result.data[0]
        else:
            # No metadata changes, use existing workflow
            item = existing_workflow
        
        # Get latest version (which should be the one we just created if workflow_data was updated)
        version = get_latest_version(supabase, workflow_id)
        if not version:
            raise HTTPException(status_code=500, detail="Failed to retrieve workflow version")
        
        return WorkflowResponse(
            id=str(item["id"]),
            name=item["name"],
            description=item.get("description"),
            user_id=str(item["user_id"]) if item.get("user_id") else "",
            is_system=item.get("is_system", False),
            workflow_data=WorkflowData(**version["payload"]),
            created_at=item["created_at"],
            updated_at=item["updated_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update workflow: {str(e)}")


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str):
    """
    Delete a workflow.
    Cannot delete system workflows (is_system=True).
    In prototype mode: all non-system workflows can be deleted by anyone.
    Deleting a workflow will cascade delete all versions (via foreign key).
    """
    try:
        supabase = get_supabase().client
        
        # Check if workflow exists
        existing = supabase.table("workflows")\
            .select("*")\
            .eq("id", workflow_id)\
            .execute()
        
        if not existing.data or len(existing.data) == 0:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        existing_workflow = existing.data[0]
        
        # Cannot delete system workflows
        if existing_workflow.get("is_system", False):
            raise HTTPException(status_code=403, detail="Cannot delete system workflows")
        
        # Delete workflow (cascades to workflow_versions via foreign key)
        supabase.table("workflows")\
            .delete()\
            .eq("id", workflow_id)\
            .execute()
        
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete workflow: {str(e)}")
