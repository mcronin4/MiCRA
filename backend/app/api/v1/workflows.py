"""
Workflow persistence API endpoints.

NOTE: This system only saves workflow structure (nodes, edges, positions).
Node inputs/outputs, attachments (e.g., base64 images), and execution state
are NOT persisted. All workflows load with nodes in 'idle' state with empty inputs.

System workflows (is_system=True) are read-only templates accessible to all users.
User workflows belong to authenticated users and can only be modified by their owners.

Workflow data is stored in workflow_versions table. The workflows table stores metadata only.
"""

import json
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from uuid import UUID
from datetime import datetime
from app.auth.dependencies import User, get_current_user, get_supabase_client
from supabase import Client


class BlueprintSnapshotNode(BaseModel):
    """A node in a blueprint snapshot (minimal structure for preview purposes)."""
    node_id: Optional[str] = None
    type: Optional[str] = None


class BlueprintSnapshot(BaseModel):
    """
    Snapshot of a blueprint structure saved with workflow run outputs.
    
    This model validates the nodes array from a full Blueprint dump.
    The full blueprint may contain additional fields (connections, workflow_inputs, etc.)
    which are ignored during validation.
    """
    nodes: Optional[List[BlueprintSnapshotNode]] = None
    
    class Config:
        # Allow extra fields from the full Blueprint structure
        extra = "ignore"


class ExecutionLogSummary(BaseModel):
    id: str
    workflow_id: str
    success: bool
    error: Optional[str] = None
    total_execution_time_ms: int
    node_count: int
    nodes_completed: int
    nodes_errored: int
    created_at: datetime


class ExecutionLogDetail(ExecutionLogSummary):
    node_summaries: List[Dict[str, Any]] = []
    blueprint: Optional[Dict[str, Any]] = None  # The compiled blueprint that was executed


class WorkflowRunSummary(BaseModel):
    execution_id: str
    workflow_id: str
    success: bool
    error: Optional[str] = None
    total_execution_time_ms: int
    node_count: int
    nodes_completed: int
    nodes_errored: int
    created_at: datetime
    has_persisted_outputs: bool


class WorkflowRunOutputsResponse(BaseModel):
    execution_id: str
    workflow_id: str
    node_outputs: Dict[str, Any]
    workflow_outputs: Dict[str, Any]
    blueprint_snapshot: Optional[BlueprintSnapshot] = None
    payload_bytes: int
    created_at: datetime


router = APIRouter(prefix="/workflows", tags=["workflows"])


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


class WorkflowVersionMetadata(BaseModel):
    """Version metadata without full payload."""
    version_number: int
    created_at: datetime
    node_count: int
    edge_count: int


class WorkflowVersionResponse(BaseModel):
    """Full version response with payload."""
    version_number: int
    workflow_id: str
    workflow_data: WorkflowData
    created_at: datetime


class CopilotPlanRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    mode: Literal["create", "edit"] = "edit"
    workflow_data: Optional[WorkflowData] = None
    preferences: Dict[str, Any] = Field(default_factory=dict)


class CopilotBuildStep(BaseModel):
    step_id: str
    kind: Literal["node_intro", "connect", "backtrack"]
    node_id: Optional[str] = None
    node_type: Optional[str] = None
    source_node_id: Optional[str] = None
    source_handle: Optional[str] = None
    target_node_id: Optional[str] = None
    target_handle: Optional[str] = None
    runtime_type: Optional[Literal["Text", "ImageRef", "AudioRef", "VideoRef"]] = None
    narration: Optional[str] = None
    is_new_node: bool = False
    order_index: int = 0


class CopilotPlanResponse(BaseModel):
    status: Literal["ready", "clarify", "error"]
    summary: str
    workflow_data: Optional[WorkflowData] = None
    operations: List[Dict[str, Any]] = Field(default_factory=list)
    diagnostics: List[Dict[str, Any]] = Field(default_factory=list)
    auto_repair_attempts: int = 0
    touched_node_ids: List[str] = Field(default_factory=list)
    build_steps: List[CopilotBuildStep] = Field(default_factory=list)
    closing_narration: Optional[str] = None
    requires_replace_confirmation: bool = False
    clarification_question: Optional[str] = None


def get_latest_version(supabase: Client, workflow_id: str) -> Optional[Dict[str, Any]]:
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


def get_latest_versions_batch(supabase: Client, workflow_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Get the latest version for multiple workflows. Returns dict mapping workflow_id to version."""
    if not workflow_ids:
        return {}
    
    # Get all versions for these workflows, ordered by version_number desc
    # Only select needed columns (not the full payload) for performance
    result = supabase.table("workflow_versions")\
        .select("workflow_id, version_number, created_at, node_count, edge_count")\
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
async def list_workflows(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    List workflows for the current authenticated user (non-system workflows only).
    Returns only metadata (no payload) for efficient listing.
    
    System workflows/templates should be fetched via /templates endpoint.
    """
    try:
        
        # Query workflows: only current user's workflows (not system workflows)
        # RLS will enforce user_id anyway, but we add checks for clarity/safety.
        query = supabase.table("workflows")\
            .select("*")\
            .eq("user_id", user.sub)\
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

            # Use pre-computed node_count and edge_count from database
            node_count = version.get("node_count", 0)
            edge_count = version.get("edge_count", 0)

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
async def list_templates(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Get only pre-built system workflow templates. Returns only metadata (no payload).
    Templates are read-only and accessible to all authenticated users.
    """
    try:
        
        # Query for system workflows: is_system = True
        # RLS Policy MUST allow reading where is_system = true
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

            # Use pre-computed node_count and edge_count from database
            node_count = version.get("node_count", 0)
            edge_count = version.get("edge_count", 0)

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


@router.post("/copilot/plan", response_model=CopilotPlanResponse)
async def copilot_plan_workflow(
    request: CopilotPlanRequest,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Plan a workflow create/edit patch from natural language (MicrAI).

    Returns a full proposed workflow graph plus operation summary so the frontend
    can preview and apply in one step.
    """
    try:
        from app.services.workflow_copilot import plan_workflow_with_copilot

        result = plan_workflow_with_copilot(
            message=request.message,
            mode=request.mode,
            workflow_data=request.workflow_data.model_dump() if request.workflow_data else None,
            user_id=user.sub,
            supabase_client=supabase,
            preferences=request.preferences,
        )
        payload = result.model_dump()
        if payload.get("workflow_data") is None:
            return CopilotPlanResponse(**payload)
        return CopilotPlanResponse(
            **{
                **payload,
                "workflow_data": WorkflowData(**payload["workflow_data"]),
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to plan workflow: {str(e)}")


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Get a specific workflow by ID.
    Users can access their own workflows or system templates.
    """
    try:
        
        result = supabase.table("workflows")\
            .select("*")\
            .eq("id", workflow_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        item = result.data[0]
        
        # Check authorization: user can access their own workflows or system templates
        workflow_user_id = str(item.get("user_id")) if item.get("user_id") else None
        is_system = item.get("is_system", False)
        
        if not is_system and workflow_user_id != user.sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this workflow"
            )
        
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


@router.get("/{workflow_id}/versions", response_model=List[WorkflowVersionMetadata])
async def list_workflow_versions(
    workflow_id: str, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    List all versions for a workflow.
    Returns version metadata (version number, timestamps, node/edge counts) without full payload.
    Users can access versions of their own workflows or system templates.
    """
    try:
        
        # Check if workflow exists and user has access
        workflow_result = supabase.table("workflows")\
            .select("*")\
            .eq("id", workflow_id)\
            .execute()
        
        if not workflow_result.data or len(workflow_result.data) == 0:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        workflow = workflow_result.data[0]
        workflow_user_id = str(workflow.get("user_id")) if workflow.get("user_id") else None
        is_system = workflow.get("is_system", False)
        
        # Check authorization
        if not is_system and workflow_user_id != user.sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this workflow"
            )
        
        # Get all versions ordered by version_number descending (newest first)
        result = supabase.table("workflow_versions")\
            .select("*")\
            .eq("workflow_id", workflow_id)\
            .order("version_number", desc=True)\
            .execute()
        
        if not result.data:
            return []
        
        versions = []
        for version in result.data:
            payload = version["payload"]
            node_count = len(payload.get("nodes", []))
            edge_count = len(payload.get("edges", []))
            
            versions.append(WorkflowVersionMetadata(
                version_number=version["version_number"],
                created_at=version["created_at"],
                node_count=node_count,
                edge_count=edge_count
            ))
        
        return versions
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list workflow versions: {str(e)}")


@router.get("/{workflow_id}/versions/{version_number}", response_model=WorkflowVersionResponse)
async def get_workflow_version(
    workflow_id: str, 
    version_number: int, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Get a specific version of a workflow.
    Returns the full workflow data for that version.
    Users can access versions of their own workflows or system templates.
    """
    try:
        
        # Check if workflow exists and user has access
        workflow_result = supabase.table("workflows")\
            .select("*")\
            .eq("id", workflow_id)\
            .execute()
        
        if not workflow_result.data or len(workflow_result.data) == 0:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        workflow = workflow_result.data[0]
        workflow_user_id = str(workflow.get("user_id")) if workflow.get("user_id") else None
        is_system = workflow.get("is_system", False)
        
        # Check authorization
        if not is_system and workflow_user_id != user.sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this workflow"
            )
        
        # Get specific version
        result = supabase.table("workflow_versions")\
            .select("*")\
            .eq("workflow_id", workflow_id)\
            .eq("version_number", version_number)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail=f"Version {version_number} not found for this workflow")
        
        version = result.data[0]
        
        return WorkflowVersionResponse(
            version_number=version["version_number"],
            workflow_id=str(version["workflow_id"]),
            workflow_data=WorkflowData(**version["payload"]),
            created_at=version["created_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get workflow version: {str(e)}")


@router.post("", response_model=WorkflowResponse, status_code=201)
async def create_workflow(
    workflow: WorkflowCreate, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Create a new workflow.
    Creates workflow metadata and initial version.
    Only admins can create system workflows (is_system=True).
    """
    try:
        
        # Validate workflow data structure
        if not workflow.workflow_data.nodes:
            raise HTTPException(status_code=400, detail="Workflow must contain at least one node")
        
        # Only allow system workflows to be created by admins (or if explicitly allowed)
        # For now, prevent regular users from creating system workflows
        if workflow.is_system:
            # TODO: Add admin role check if needed
            # For now, prevent regular users from creating system workflows
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can create system workflows"
            )
        
        # Create workflow metadata
        # System workflows should have NULL user_id per schema
        # User workflows have the authenticated user's ID
        workflow_data = {
            "name": workflow.name,
            "description": workflow.description,
            "user_id": None if workflow.is_system else user.sub,
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
            "payload": workflow.workflow_data.model_dump(),
            "user_id": user.sub
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
async def update_workflow(
    workflow_id: str, 
    workflow: WorkflowUpdate, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Update an existing workflow.
    Cannot update system workflows (is_system=True).
    Users can only update their own workflows.
    When updating workflow_data, saves current version to workflow_versions and creates new version.
    """
    try:
        
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
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify system workflows"
            )
        
        # Check authorization: user can only update their own workflows
        workflow_user_id = str(existing_workflow.get("user_id")) if existing_workflow.get("user_id") else None
        if workflow_user_id != user.sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to update this workflow"
            )
        
        # If workflow_data is being updated, we need to save current version first
        if workflow.workflow_data is not None:
            # Validate workflow data if provided
            if not workflow.workflow_data.nodes:
                raise HTTPException(status_code=400, detail="Workflow must contain at least one node")
            
            # Get current version to save it (the trigger will auto-increment, so we're creating a new version)
            # The current version is already saved, we just need to create a new one
            version_data = {
                "workflow_id": workflow_id,
                "payload": workflow.workflow_data.model_dump(),
                "user_id": user.sub
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


class ExecuteRawRequest(BaseModel):
    """Execute a raw (unsaved) workflow."""
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    workflow_id: Optional[str] = None
    workflow_name: Optional[str] = None


class ExecuteByIdRequest(BaseModel):
    """Execute a saved workflow by ID."""
    pass


def _assert_workflow_access_or_404(
    supabase: Client,
    workflow_id: str,
    user: User,
) -> Dict[str, Any]:
    wf_result = supabase.table("workflows")\
        .select("*")\
        .eq("id", workflow_id)\
        .execute()

    if not wf_result.data or len(wf_result.data) == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf = wf_result.data[0]
    wf_user_id = str(wf.get("user_id")) if wf.get("user_id") else None
    is_system = wf.get("is_system", False)
    if not is_system and wf_user_id != user.sub:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this workflow",
        )
    return wf


@router.post("/execute")
async def execute_workflow_raw(
    request: ExecuteRawRequest,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Compile and execute a raw (unsaved) editor graph.
    Accepts nodes and edges. Returns execution results.
    """
    from app.services.blueprint_compiler import compile_workflow
    from app.services.workflow_executor import execute_workflow, save_execution_log

    # Use provided workflow_id and name if available, otherwise use defaults
    workflow_id = request.workflow_id
    workflow_name = request.workflow_name or "Unsaved Workflow"
    
    result = compile_workflow(
        nodes=request.nodes,
        edges=request.edges,
        name=workflow_name,
        workflow_id=workflow_id,
        created_by=user.sub,
    )

    if not result.success:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Compilation failed",
                "diagnostics": [d.model_dump() for d in result.diagnostics],
            },
        )

    execution_result = await execute_workflow(
        blueprint=result.blueprint,
    )

    _, warning = save_execution_log(
        execution_result,
        workflow_id,
        user.sub,
        blueprint=result.blueprint,
    )
    execution_result.persistence_warning = warning

    return execution_result.model_dump()


@router.post("/compile")
async def compile_workflow_raw(
    workflow_data: WorkflowData,
    user: User = Depends(get_current_user),
):
    """
    Compile a raw (unsaved) editor graph into a Blueprint.
    Accepts WorkflowData in the body, returns Blueprint JSON or diagnostics.
    """
    from app.services.blueprint_compiler import compile_workflow

    result = compile_workflow(
        nodes=workflow_data.nodes,
        edges=workflow_data.edges,
        name="Unsaved Workflow",
        created_by=user.sub,
    )

    if not result.success:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Compilation failed",
                "diagnostics": [d.model_dump() for d in result.diagnostics],
            },
        )

    return result.model_dump()


@router.post("/{workflow_id}/compile")
async def compile_workflow_by_id(
    workflow_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Fetch the latest version of a saved workflow and compile it into a Blueprint.
    """
    from app.services.blueprint_compiler import compile_workflow

    try:
        # Fetch workflow metadata
        wf_result = supabase.table("workflows")\
            .select("*")\
            .eq("id", workflow_id)\
            .execute()

        if not wf_result.data or len(wf_result.data) == 0:
            raise HTTPException(status_code=404, detail="Workflow not found")

        wf = wf_result.data[0]
        wf_user_id = str(wf.get("user_id")) if wf.get("user_id") else None
        is_system = wf.get("is_system", False)

        if not is_system and wf_user_id != user.sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this workflow",
            )

        version = get_latest_version(supabase, workflow_id)
        if not version:
            raise HTTPException(status_code=404, detail="No versions found for workflow")

        payload = version["payload"]
        result = compile_workflow(
            nodes=payload.get("nodes", []),
            edges=payload.get("edges", []),
            workflow_id=workflow_id,
            version=version.get("version_number"),
            name=wf.get("name", "Untitled"),
            description=wf.get("description"),
            created_by=user.sub,
        )

        if not result.success:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Compilation failed",
                    "diagnostics": [d.model_dump() for d in result.diagnostics],
                },
            )

        return result.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compile workflow: {str(e)}")


@router.post("/{workflow_id}/execute")
async def execute_workflow_by_id(
    workflow_id: str,
    request: ExecuteByIdRequest,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Fetch the latest version of a saved workflow, compile it, and execute.
    """
    from app.services.blueprint_compiler import compile_workflow
    from app.services.workflow_executor import execute_workflow, save_execution_log

    try:
        wf = _assert_workflow_access_or_404(supabase, workflow_id, user)

        version = get_latest_version(supabase, workflow_id)
        if not version:
            raise HTTPException(status_code=404, detail="No versions found for workflow")

        payload = version["payload"]
        compilation = compile_workflow(
            nodes=payload.get("nodes", []),
            edges=payload.get("edges", []),
            workflow_id=workflow_id,
            version=version.get("version_number"),
            name=wf.get("name", "Untitled"),
            description=wf.get("description"),
            created_by=user.sub,
        )

        if not compilation.success:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Compilation failed",
                    "diagnostics": [d.model_dump() for d in compilation.diagnostics],
                },
            )

        execution_result = await execute_workflow(
            blueprint=compilation.blueprint,
        )

        _, warning = save_execution_log(
            execution_result,
            workflow_id,
            user.sub,
            blueprint=compilation.blueprint,
        )
        execution_result.persistence_warning = warning

        return execution_result.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute workflow: {str(e)}")


@router.post("/execute/stream")
async def execute_workflow_stream(
    request: ExecuteRawRequest,
    user: User = Depends(get_current_user),
):
    """
    Compile and execute a workflow with Server-Sent Events (SSE) streaming.

    Returns a stream of events as each node executes:
    - node_start: Node is about to execute
    - node_complete: Node finished successfully
    - node_error: Node failed
    - workflow_complete: All nodes finished successfully
    - workflow_error: Execution stopped due to error
    """
    from app.services.blueprint_compiler import compile_workflow
    from app.services.workflow_executor import execute_workflow_streaming, save_execution_log

    # Compile first (not streamed)
    compilation = compile_workflow(
        nodes=request.nodes,
        edges=request.edges,
        workflow_id=request.workflow_id,
        name=request.workflow_name or "Untitled",
        created_by=user.sub,
    )

    if not compilation.success:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Compilation failed",
                "diagnostics": [d.model_dump() for d in compilation.diagnostics],
            },
        )

    async def event_generator():
        async for event in execute_workflow_streaming(compilation.blueprint):
            if not event.startswith("data: "):
                yield event
                continue

            payload = event[len("data: "):].strip()
            try:
                parsed = json.loads(payload)
            except Exception:
                yield event
                continue

            event_type = parsed.get("event")
            if event_type in ("workflow_complete", "workflow_error"):
                from app.services.workflow_executor import WorkflowExecutionResult

                node_results = parsed.get("node_results") or []
                workflow_result = WorkflowExecutionResult(
                    success=event_type == "workflow_complete",
                    workflow_outputs=parsed.get("workflow_outputs") or {},
                    node_results=node_results,
                    total_execution_time_ms=parsed.get("total_execution_time_ms") or 0,
                    error=parsed.get("error"),
                )
                _, warning = save_execution_log(
                    workflow_result,
                    request.workflow_id,
                    user.sub,
                    blueprint=compilation.blueprint,
                )
                if warning:
                    parsed["persistence_warning"] = warning
                yield f"data: {json.dumps(parsed)}\n\n"
                continue

            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/{workflow_id}/execute/stream")
async def execute_workflow_by_id_stream(
    workflow_id: str,
    request: ExecuteByIdRequest,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Fetch, compile, and execute a saved workflow with SSE streaming.
    """
    from app.services.blueprint_compiler import compile_workflow
    from app.services.workflow_executor import execute_workflow_streaming, save_execution_log

    try:
        _ = request
        wf = _assert_workflow_access_or_404(supabase, workflow_id, user)

        version = get_latest_version(supabase, workflow_id)
        if not version:
            raise HTTPException(status_code=404, detail="No versions found for workflow")

        payload = version["payload"]
        compilation = compile_workflow(
            nodes=payload.get("nodes", []),
            edges=payload.get("edges", []),
            workflow_id=workflow_id,
            version=version.get("version_number"),
            name=wf.get("name", "Untitled"),
            description=wf.get("description"),
            created_by=user.sub,
        )

        if not compilation.success:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Compilation failed",
                    "diagnostics": [d.model_dump() for d in compilation.diagnostics],
                },
            )

        async def event_generator():
            async for event in execute_workflow_streaming(compilation.blueprint):
                if not event.startswith("data: "):
                    yield event
                    continue

                payload = event[len("data: "):].strip()
                try:
                    parsed = json.loads(payload)
                except Exception:
                    yield event
                    continue

                event_type = parsed.get("event")
                if event_type in ("workflow_complete", "workflow_error"):
                    from app.services.workflow_executor import WorkflowExecutionResult

                    workflow_result = WorkflowExecutionResult(
                        success=event_type == "workflow_complete",
                        workflow_outputs=parsed.get("workflow_outputs") or {},
                        node_results=parsed.get("node_results") or [],
                        total_execution_time_ms=parsed.get("total_execution_time_ms") or 0,
                        error=parsed.get("error"),
                    )
                    _, warning = save_execution_log(
                        workflow_result,
                        workflow_id,
                        user.sub,
                        blueprint=compilation.blueprint,
                    )
                    if warning:
                        parsed["persistence_warning"] = warning
                    yield f"data: {json.dumps(parsed)}\n\n"
                    continue

                yield event

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute workflow: {str(e)}")


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str, user: User = Depends(get_current_user)):
    """
    Delete a workflow.
    Cannot delete system workflows (is_system=True).
    Users can only delete their own workflows.
    Deleting a workflow will cascade delete all versions (via foreign key).
    """
    try:
        from app.db.supabase import get_supabase
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
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete system workflows"
            )
        
        # Check authorization: user can only delete their own workflows
        workflow_user_id = str(existing_workflow.get("user_id")) if existing_workflow.get("user_id") else None
        if workflow_user_id != user.sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this workflow"
            )
        
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


@router.get("/{workflow_id}/runs", response_model=List[WorkflowRunSummary])
async def list_workflow_runs(
    workflow_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """List run history for a workflow with persisted-output availability."""
    try:
        _assert_workflow_access_or_404(supabase, workflow_id, user)

        execution_result = supabase.table("executions")\
            .select("id, workflow_id, success, error, total_execution_time_ms, node_count, nodes_completed, nodes_errored, created_at")\
            .eq("workflow_id", workflow_id)\
            .eq("user_id", user.sub)\
            .order("created_at", desc=True)\
            .execute()

        execution_rows = execution_result.data or []
        execution_ids = [str(row["id"]) for row in execution_rows]
        persisted_ids: set[str] = set()
        if execution_ids:
            outputs_result = supabase.table("workflow_run_outputs")\
                .select("execution_id")\
                .in_("execution_id", execution_ids)\
                .execute()
            persisted_ids = {
                str(row["execution_id"])
                for row in (outputs_result.data or [])
            }

        return [
            WorkflowRunSummary(
                execution_id=str(row["id"]),
                workflow_id=str(row["workflow_id"]),
                success=row["success"],
                error=row.get("error"),
                total_execution_time_ms=row["total_execution_time_ms"],
                node_count=row["node_count"],
                nodes_completed=row["nodes_completed"],
                nodes_errored=row["nodes_errored"],
                created_at=row["created_at"],
                has_persisted_outputs=str(row["id"]) in persisted_ids,
            )
            for row in execution_rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list workflow runs: {str(e)}")


@router.get("/{workflow_id}/runs/{execution_id}/outputs", response_model=WorkflowRunOutputsResponse)
async def get_workflow_run_outputs(
    workflow_id: str,
    execution_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Get persisted outputs for a specific workflow run."""
    try:
        _assert_workflow_access_or_404(supabase, workflow_id, user)

        result = supabase.table("workflow_run_outputs")\
            .select("*")\
            .eq("workflow_id", workflow_id)\
            .eq("execution_id", execution_id)\
            .eq("user_id", user.sub)\
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Persisted outputs not found for this run")

        row = result.data[0]
        
        # Parse blueprint_snapshot with validation
        blueprint_snapshot_raw = row.get("blueprint_snapshot")
        blueprint_snapshot: Optional[BlueprintSnapshot] = None
        if blueprint_snapshot_raw:
            try:
                # Validate and parse the blueprint snapshot structure
                blueprint_snapshot = BlueprintSnapshot.model_validate(blueprint_snapshot_raw)
            except Exception as e:
                # If validation fails, log but don't fail the request
                # This handles legacy data that might not match the expected structure
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"Failed to validate blueprint_snapshot for execution {execution_id}: {e}. "
                    "Returning None to maintain backward compatibility."
                )
                blueprint_snapshot = None
        
        return WorkflowRunOutputsResponse(
            execution_id=str(row["execution_id"]),
            workflow_id=str(row["workflow_id"]),
            node_outputs=row.get("node_outputs") or {},
            workflow_outputs=row.get("workflow_outputs") or {},
            blueprint_snapshot=blueprint_snapshot,
            payload_bytes=row.get("payload_bytes") or 0,
            created_at=row["created_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch run outputs: {str(e)}")


@router.get("/{workflow_id}/executions", response_model=List[ExecutionLogSummary])
async def list_execution_logs(
    workflow_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """List execution logs for a workflow (summary only, no node_summaries)."""
    try:
        # Verify workflow exists and user has access
        wf_result = supabase.table("workflows")\
            .select("user_id, is_system")\
            .eq("id", workflow_id)\
            .execute()

        if not wf_result.data:
            raise HTTPException(status_code=404, detail="Workflow not found")

        wf = wf_result.data[0]
        wf_user_id = str(wf.get("user_id")) if wf.get("user_id") else None
        if not wf.get("is_system", False) and wf_user_id != user.sub:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        result = supabase.table("executions")\
            .select("id, workflow_id, success, error, total_execution_time_ms, node_count, nodes_completed, nodes_errored, created_at")\
            .eq("workflow_id", workflow_id)\
            .order("created_at", desc=True)\
            .execute()

        return [
            ExecutionLogSummary(
                id=str(row["id"]),
                workflow_id=str(row["workflow_id"]),
                success=row["success"],
                error=row.get("error"),
                total_execution_time_ms=row["total_execution_time_ms"],
                node_count=row["node_count"],
                nodes_completed=row["nodes_completed"],
                nodes_errored=row["nodes_errored"],
                created_at=row["created_at"],
            )
            for row in (result.data or [])
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list execution logs: {str(e)}")


@router.get("/{workflow_id}/executions/{execution_id}", response_model=ExecutionLogDetail)
async def get_execution_log(
    workflow_id: str,
    execution_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Get a single execution log with node_summaries."""
    try:
        # Verify workflow exists and user has access
        wf_result = supabase.table("workflows")\
            .select("user_id, is_system")\
            .eq("id", workflow_id)\
            .execute()

        if not wf_result.data:
            raise HTTPException(status_code=404, detail="Workflow not found")

        wf = wf_result.data[0]
        wf_user_id = str(wf.get("user_id")) if wf.get("user_id") else None
        if not wf.get("is_system", False) and wf_user_id != user.sub:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        result = supabase.table("executions")\
            .select("*")\
            .eq("id", execution_id)\
            .eq("workflow_id", workflow_id)\
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Execution log not found")

        row = result.data[0]
        return ExecutionLogDetail(
            id=str(row["id"]),
            workflow_id=str(row["workflow_id"]),
            success=row["success"],
            error=row.get("error"),
            total_execution_time_ms=row["total_execution_time_ms"],
            node_count=row["node_count"],
            nodes_completed=row["nodes_completed"],
            nodes_errored=row["nodes_errored"],
            node_summaries=row.get("node_summaries", []),
            blueprint=row.get("blueprint"),
            created_at=row["created_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get execution log: {str(e)}")


# --- Preview Drafts ---

class DraftCreate(BaseModel):
    name: str
    execution_id: Optional[str] = None
    platform_id: str = "linkedin"
    tone: str = "professional"
    slot_content: Dict[str, Any] = Field(default_factory=dict)


class DraftUpdate(BaseModel):
    name: Optional[str] = None
    tone: Optional[str] = None
    slot_content: Optional[Dict[str, Any]] = None


class DraftResponse(BaseModel):
    id: str
    workflow_id: str
    user_id: str
    execution_id: Optional[str]
    name: str
    platform_id: str
    tone: str
    slot_content: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DraftListItem(BaseModel):
    id: str
    name: str
    execution_id: Optional[str]
    platform_id: str
    tone: str
    created_at: datetime
    updated_at: datetime


@router.get("/{workflow_id}/drafts", response_model=List[DraftListItem])
async def list_preview_drafts(
    workflow_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """List preview drafts for a workflow."""
    try:
        _assert_workflow_access_or_404(supabase, workflow_id, user)

        result = supabase.table("preview_drafts")\
            .select("id, name, execution_id, platform_id, tone, created_at, updated_at")\
            .eq("workflow_id", workflow_id)\
            .eq("user_id", user.sub)\
            .order("updated_at", desc=True)\
            .execute()

        return [
            DraftListItem(
                id=str(row["id"]),
                name=row["name"],
                execution_id=str(row["execution_id"]) if row.get("execution_id") else None,
                platform_id=row.get("platform_id", "linkedin"),
                tone=row.get("tone", "professional"),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in (result.data or [])
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list drafts: {str(e)}")


@router.post("/{workflow_id}/drafts", response_model=DraftResponse, status_code=201)
async def create_preview_draft(
    workflow_id: str,
    body: DraftCreate,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Create a new preview draft."""
    try:
        _assert_workflow_access_or_404(supabase, workflow_id, user)

        row = {
            "workflow_id": workflow_id,
            "user_id": user.sub,
            "name": body.name,
            "platform_id": body.platform_id,
            "tone": body.tone,
            "slot_content": body.slot_content or {},
        }
        if body.execution_id:
            row["execution_id"] = body.execution_id

        result = supabase.table("preview_drafts").insert(row).execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create draft")

        r = result.data[0]
        return DraftResponse(
            id=str(r["id"]),
            workflow_id=str(r["workflow_id"]),
            user_id=str(r["user_id"]),
            execution_id=str(r["execution_id"]) if r.get("execution_id") else None,
            name=r["name"],
            platform_id=r.get("platform_id", "linkedin"),
            tone=r.get("tone", "professional"),
            slot_content=r.get("slot_content") or {},
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create draft: {str(e)}")


@router.get("/{workflow_id}/drafts/{draft_id}", response_model=DraftResponse)
async def get_preview_draft(
    workflow_id: str,
    draft_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Get a single preview draft."""
    try:
        _assert_workflow_access_or_404(supabase, workflow_id, user)

        result = supabase.table("preview_drafts")\
            .select("*")\
            .eq("id", draft_id)\
            .eq("workflow_id", workflow_id)\
            .eq("user_id", user.sub)\
            .execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Draft not found")

        r = result.data[0]
        return DraftResponse(
            id=str(r["id"]),
            workflow_id=str(r["workflow_id"]),
            user_id=str(r["user_id"]),
            execution_id=str(r["execution_id"]) if r.get("execution_id") else None,
            name=r["name"],
            platform_id=r.get("platform_id", "linkedin"),
            tone=r.get("tone", "professional"),
            slot_content=r.get("slot_content") or {},
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get draft: {str(e)}")


@router.patch("/{workflow_id}/drafts/{draft_id}", response_model=DraftResponse)
async def update_preview_draft(
    workflow_id: str,
    draft_id: str,
    body: DraftUpdate,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Update a preview draft."""
    try:
        _assert_workflow_access_or_404(supabase, workflow_id, user)

        updates: Dict[str, Any] = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.tone is not None:
            updates["tone"] = body.tone
        if body.slot_content is not None:
            updates["slot_content"] = body.slot_content

        if not updates:
            # Fetch and return current state
            result = supabase.table("preview_drafts")\
                .select("*")\
                .eq("id", draft_id)\
                .eq("workflow_id", workflow_id)\
                .eq("user_id", user.sub)\
                .execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Draft not found")
            r = result.data[0]
            return DraftResponse(
                id=str(r["id"]),
                workflow_id=str(r["workflow_id"]),
                user_id=str(r["user_id"]),
                execution_id=str(r["execution_id"]) if r.get("execution_id") else None,
                name=r["name"],
                platform_id=r.get("platform_id", "linkedin"),
                tone=r.get("tone", "professional"),
                slot_content=r.get("slot_content") or {},
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )

        result = supabase.table("preview_drafts")\
            .update(updates)\
            .eq("id", draft_id)\
            .eq("workflow_id", workflow_id)\
            .eq("user_id", user.sub)\
            .execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Draft not found")

        r = result.data[0]
        return DraftResponse(
            id=str(r["id"]),
            workflow_id=str(r["workflow_id"]),
            user_id=str(r["user_id"]),
            execution_id=str(r["execution_id"]) if r.get("execution_id") else None,
            name=r["name"],
            platform_id=r.get("platform_id", "linkedin"),
            tone=r.get("tone", "professional"),
            slot_content=r.get("slot_content") or {},
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update draft: {str(e)}")


@router.delete("/{workflow_id}/drafts/{draft_id}", status_code=204)
async def delete_preview_draft(
    workflow_id: str,
    draft_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Delete a preview draft."""
    try:
        _assert_workflow_access_or_404(supabase, workflow_id, user)

        result = supabase.table("preview_drafts")\
            .delete()\
            .eq("id", draft_id)\
            .eq("workflow_id", workflow_id)\
            .eq("user_id", user.sub)\
            .execute()

        # Supabase delete returns the deleted rows; empty means nothing was deleted
        if result.data is not None and len(result.data) > 0:
            return
        # If no rows returned, the draft may not have existed - still return 204 for idempotency
        return
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete draft: {str(e)}")
