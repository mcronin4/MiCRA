"""
Workflow persistence API endpoints.

NOTE: This system only saves workflow structure (nodes, edges, positions).
Node inputs/outputs, attachments (e.g., base64 images), and execution state
are NOT persisted. All workflows load with nodes in 'idle' state with empty inputs.

System workflows (is_system=True) are read-only templates accessible to all users.
User workflows belong to authenticated users and can only be modified by their owners.

Workflow data is stored in workflow_versions table. The workflows table stores metadata only.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from app.db.supabase import get_supabase
from app.auth.dependencies import User, get_current_user


class ExecutionLogSummary(BaseModel):
    id: str
    workflow_id: str
    success: bool
    error: str | None
    total_execution_time_ms: int
    node_count: int
    nodes_completed: int
    nodes_errored: int
    created_at: datetime


class ExecutionLogDetail(ExecutionLogSummary):
    node_summaries: list[dict]
    blueprint: dict | None = None  # The compiled blueprint that was executed

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
async def list_workflows(user: User = Depends(get_current_user)):
    """
    List workflows for the current authenticated user (non-system workflows only).
    Returns only metadata (no payload) for efficient listing.
    
    System workflows/templates should be fetched via /templates endpoint.
    """
    try:
        supabase = get_supabase().client
        
        # Query workflows: only current user's workflows (not system workflows)
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
async def list_templates(user: User = Depends(get_current_user)):
    """
    Get only pre-built system workflow templates. Returns only metadata (no payload).
    Templates are read-only and accessible to all authenticated users.
    """
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
async def get_workflow(workflow_id: str, user: User = Depends(get_current_user)):
    """
    Get a specific workflow by ID.
    Users can access their own workflows or system templates.
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
async def list_workflow_versions(workflow_id: str, user: User = Depends(get_current_user)):
    """
    List all versions for a workflow.
    Returns version metadata (version number, timestamps, node/edge counts) without full payload.
    Users can access versions of their own workflows or system templates.
    """
    try:
        supabase = get_supabase().client
        
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
    user: User = Depends(get_current_user)
):
    """
    Get a specific version of a workflow.
    Returns the full workflow data for that version.
    Users can access versions of their own workflows or system templates.
    """
    try:
        supabase = get_supabase().client
        
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
async def create_workflow(workflow: WorkflowCreate, user: User = Depends(get_current_user)):
    """
    Create a new workflow.
    Creates workflow metadata and initial version.
    Only admins can create system workflows (is_system=True).
    """
    try:
        supabase = get_supabase().client
        
        # Validate workflow data structure
        if not workflow.workflow_data.nodes:
            raise HTTPException(status_code=400, detail="Workflow must contain at least one node")
        
        # Only allow system workflows to be created by admins (or if explicitly allowed)
        # For now, regular users cannot create system workflows
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
async def update_workflow(
    workflow_id: str, 
    workflow: WorkflowUpdate, 
    user: User = Depends(get_current_user)
):
    """
    Update an existing workflow.
    Cannot update system workflows (is_system=True).
    Users can only update their own workflows.
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


class ExecuteRawRequest(BaseModel):
    """Execute a raw (unsaved) workflow."""
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    workflow_id: str | None = None
    workflow_name: str | None = None


class ExecuteByIdRequest(BaseModel):
    """Execute a saved workflow by ID."""
    pass


@router.post("/execute")
async def execute_workflow_raw(
    request: ExecuteRawRequest,
    user: User = Depends(get_current_user),
):
    """
    Compile and execute a raw (unsaved) editor graph.
    Accepts nodes and edges. Returns execution results.
    """
    from app.services.blueprint_compiler import compile_workflow
    from app.services.workflow_executor import execute_workflow

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
    
    # Save execution log with workflow_id if provided
    from app.services.workflow_executor import save_execution_log
    save_execution_log(execution_result, workflow_id, user.sub, blueprint=result.blueprint)
    
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
):
    """
    Fetch the latest version of a saved workflow and compile it into a Blueprint.
    """
    from app.services.blueprint_compiler import compile_workflow

    try:
        supabase = get_supabase().client

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
):
    """
    Fetch the latest version of a saved workflow, compile it, and execute.
    """
    from app.services.blueprint_compiler import compile_workflow
    from app.services.workflow_executor import execute_workflow

    try:
        supabase = get_supabase().client

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

        from app.services.workflow_executor import save_execution_log
        save_execution_log(execution_result, workflow_id, user.sub, blueprint=compilation.blueprint)

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
    from app.services.workflow_executor import execute_workflow_streaming

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
):
    """
    Fetch, compile, and execute a saved workflow with SSE streaming.
    """
    from app.services.blueprint_compiler import compile_workflow
    from app.services.workflow_executor import execute_workflow_streaming

    try:
        supabase = get_supabase().client

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


@router.get("/{workflow_id}/executions", response_model=List[ExecutionLogSummary])
async def list_execution_logs(
    workflow_id: str,
    user: User = Depends(get_current_user),
):
    """List execution logs for a workflow (summary only, no node_summaries)."""
    try:
        supabase = get_supabase().client

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
):
    """Get a single execution log with node_summaries."""
    try:
        supabase = get_supabase().client

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
