"""
Workflow persistence API endpoints.

NOTE: This system only saves workflow structure (nodes, edges, positions).
Node inputs/outputs, attachments (e.g., base64 images), and execution state
are NOT persisted. All workflows load with nodes in 'idle' state with empty inputs.

In prototype mode (no authentication), all workflows are accessible to all users.
System workflows (is_system_workflow=True) cannot be deleted or updated.
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
    is_system_workflow: bool = False


class WorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    workflow_data: Optional[WorkflowData] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    user_id: str
    is_system_workflow: bool
    is_public: bool
    workflow_data: WorkflowData
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=List[WorkflowResponse])
async def list_workflows(include_system: bool = True):
    """
    List workflows accessible to the user.
    In prototype mode: returns all workflows (user + system if include_system=True).
    """
    try:
        supabase = get_supabase().client
        
        query = supabase.table("workflows").select("*")
        
        if not include_system:
            # Only user workflows (in prototype, all non-system workflows)
            query = query.eq("is_system_workflow", False)
        
        query = query.order("updated_at", desc=True)
        
        result = query.execute()
        
        if not result.data:
            return []
        
        workflows = []
        for item in result.data:
            workflows.append(WorkflowResponse(
                id=str(item["id"]),
                name=item["name"],
                description=item.get("description"),
                user_id=str(item["user_id"]),
                is_system_workflow=item.get("is_system_workflow", False),
                is_public=item.get("is_public", False),
                workflow_data=WorkflowData(**item["workflow_data"]),
                created_at=item["created_at"],
                updated_at=item["updated_at"]
            ))
        
        return workflows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list workflows: {str(e)}")


@router.get("/templates", response_model=List[WorkflowResponse])
async def list_templates():
    """Get only pre-built system workflow templates."""
    try:
        supabase = get_supabase().client
        
        result = supabase.table("workflows")\
            .select("*")\
            .eq("is_system_workflow", True)\
            .order("name")\
            .execute()
        
        if not result.data:
            return []
        
        templates = []
        for item in result.data:
            templates.append(WorkflowResponse(
                id=str(item["id"]),
                name=item["name"],
                description=item.get("description"),
                user_id=str(item["user_id"]),
                is_system_workflow=True,
                is_public=item.get("is_public", False),
                workflow_data=WorkflowData(**item["workflow_data"]),
                created_at=item["created_at"],
                updated_at=item["updated_at"]
            ))
        
        return templates
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {str(e)}")


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
        
        return WorkflowResponse(
            id=str(item["id"]),
            name=item["name"],
            description=item.get("description"),
            user_id=str(item["user_id"]),
            is_system_workflow=item.get("is_system_workflow", False),
            is_public=item.get("is_public", False),
            workflow_data=WorkflowData(**item["workflow_data"]),
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
    """
    try:
        supabase = get_supabase().client
        
        # Validate workflow data structure
        if not workflow.workflow_data.nodes:
            raise HTTPException(status_code=400, detail="Workflow must contain at least one node")
        
        data = {
            "name": workflow.name,
            "description": workflow.description,
            "user_id": DEFAULT_USER_ID,
            "is_system_workflow": workflow.is_system_workflow,
            "is_public": False,  # Private by default (not used in prototype, but keep for future)
            "workflow_data": workflow.workflow_data.model_dump()
        }
        
        result = supabase.table("workflows").insert(data).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create workflow")
        
        item = result.data[0]
        
        return WorkflowResponse(
            id=str(item["id"]),
            name=item["name"],
            description=item.get("description"),
            user_id=str(item["user_id"]),
            is_system_workflow=item.get("is_system_workflow", False),
            is_public=item.get("is_public", False),
            workflow_data=WorkflowData(**item["workflow_data"]),
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
    Cannot update system workflows (is_system_workflow=True).
    In prototype mode: all non-system workflows can be updated by anyone.
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
        if existing_workflow.get("is_system_workflow", False):
            raise HTTPException(status_code=403, detail="Cannot modify system workflows")
        
        # Build update data
        update_data = {}
        if workflow.name is not None:
            update_data["name"] = workflow.name
        if workflow.description is not None:
            update_data["description"] = workflow.description
        if workflow.workflow_data is not None:
            # Validate workflow data if provided
            if not workflow.workflow_data.nodes:
                raise HTTPException(status_code=400, detail="Workflow must contain at least one node")
            update_data["workflow_data"] = workflow.workflow_data.model_dump()
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = supabase.table("workflows")\
            .update(update_data)\
            .eq("id", workflow_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to update workflow")
        
        item = result.data[0]
        
        return WorkflowResponse(
            id=str(item["id"]),
            name=item["name"],
            description=item.get("description"),
            user_id=str(item["user_id"]),
            is_system_workflow=item.get("is_system_workflow", False),
            is_public=item.get("is_public", False),
            workflow_data=WorkflowData(**item["workflow_data"]),
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
    Cannot delete system workflows (is_system_workflow=True).
    In prototype mode: all non-system workflows can be deleted by anyone.
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
        if existing_workflow.get("is_system_workflow", False):
            raise HTTPException(status_code=403, detail="Cannot delete system workflows")
        
        supabase.table("workflows")\
            .delete()\
            .eq("id", workflow_id)\
            .execute()
        
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete workflow: {str(e)}")
