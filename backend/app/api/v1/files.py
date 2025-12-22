"""
File management endpoints for Supabase Storage integration.
Handles upload initialization, completion, download signing, and listing.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID, uuid4
import os
import re
from ...db.supabase import get_supabase

router = APIRouter(prefix="/files", tags=["files"])

# Constants
ALLOWED_BUCKETS = {"media", "docs"}
ALLOWED_TYPES = {"image", "video", "text", "pdf", "other"}
ALLOWED_STATUSES = {"pending", "uploaded", "failed", "deleted"}

# Content type mappings
MEDIA_CONTENT_TYPES = {
    "image": ["image/"],
    "video": ["video/"],
}
DOCS_CONTENT_TYPES = {
    "text": ["text/"],
    "pdf": ["application/pdf"],
}

# Max file size: 500MB
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024


# Pydantic Models
class InitUploadRequest(BaseModel):
    bucket: str = Field(..., description="Bucket name: 'media' or 'docs'")
    type: str = Field(..., description="File type: 'image', 'video', 'text', 'pdf', or 'other'")
    contentType: str = Field(..., alias="contentType", description="MIME content type")
    name: str = Field(..., description="File name")
    parentId: Optional[UUID] = Field(None, alias="parentId", description="Optional parent file ID")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    @field_validator("bucket")
    @classmethod
    def validate_bucket(cls, v: str) -> str:
        if v not in ALLOWED_BUCKETS:
            raise ValueError(f"Bucket must be one of: {', '.join(ALLOWED_BUCKETS)}")
        return v
    
    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ALLOWED_TYPES:
            raise ValueError(f"Type must be one of: {', '.join(ALLOWED_TYPES)}")
        return v
    
    @field_validator("contentType")
    @classmethod
    def validate_content_type(cls, v: str, info) -> str:
        bucket = info.data.get("bucket")
        file_type = info.data.get("type")
        
        if bucket == "media":
            allowed_prefixes = []
            if file_type == "image":
                allowed_prefixes = MEDIA_CONTENT_TYPES["image"]
            elif file_type == "video":
                allowed_prefixes = MEDIA_CONTENT_TYPES["video"]
            
            if not any(v.startswith(prefix) for prefix in allowed_prefixes):
                raise ValueError(
                    f"For bucket 'media' and type '{file_type}', "
                    f"contentType must start with one of: {', '.join(allowed_prefixes)}"
                )
        elif bucket == "docs":
            allowed_prefixes = []
            if file_type == "text":
                allowed_prefixes = DOCS_CONTENT_TYPES["text"]
            elif file_type == "pdf":
                allowed_prefixes = DOCS_CONTENT_TYPES["pdf"]
            
            if not any(v.startswith(prefix) for prefix in allowed_prefixes):
                raise ValueError(
                    f"For bucket 'docs' and type '{file_type}', "
                    f"contentType must start with one of: {', '.join(allowed_prefixes)}"
                )
        
        return v


class FileResponse(BaseModel):
    id: UUID
    bucket: str
    path: str
    type: str
    sizeBytes: Optional[int] = Field(None, alias="size_bytes")
    name: str
    parentId: Optional[UUID] = Field(None, alias="parent_id")
    contentType: str = Field(..., alias="content_type")
    status: str
    metadata: Dict[str, Any]
    createdAt: datetime = Field(..., alias="created_at")
    uploadedAt: Optional[datetime] = Field(None, alias="uploaded_at")
    deletedAt: Optional[datetime] = Field(None, alias="deleted_at")
    
    class Config:
        populate_by_name = True


class InitUploadResponse(BaseModel):
    file: FileResponse
    upload: Dict[str, str]  # { signedUrl, token }


class CompleteUploadRequest(BaseModel):
    fileId: UUID = Field(..., alias="fileId")
    sizeBytes: Optional[int] = Field(None, alias="sizeBytes")
    
    class Config:
        populate_by_name = True


class CompleteUploadResponse(BaseModel):
    ok: bool
    file: FileResponse


class SignDownloadRequest(BaseModel):
    fileId: UUID = Field(..., alias="fileId")
    expiresIn: Optional[int] = Field(60, alias="expiresIn", description="Expiration in seconds")
    
    class Config:
        populate_by_name = True


class SignDownloadResponse(BaseModel):
    signedUrl: str


class FileListItem(FileResponse):
    signedUrl: Optional[str] = None


class ListFilesResponse(BaseModel):
    items: List[FileListItem]
    nextOffset: Optional[int] = None


# Helper functions
def sanitize_filename(filename: str) -> str:
    """Sanitize filename for storage."""
    # Remove path separators and dangerous characters
    filename = os.path.basename(filename)
    # Replace spaces and special chars with underscores, keep alphanumeric, dots, dashes, underscores
    filename = re.sub(r'[^\w\.-]', '_', filename)
    return filename


def get_extension_from_name(name: str) -> Optional[str]:
    """Extract extension from filename."""
    parts = name.rsplit('.', 1)
    if len(parts) == 2 and parts[1]:
        return parts[1].lower()
    return None


def get_extension_from_content_type(content_type: str) -> Optional[str]:
    """Map content type to common extension."""
    mapping = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "video/mpeg": "mpeg",
        "video/quicktime": "mov",
        "video/webm": "webm",
        "text/plain": "txt",
        "text/markdown": "md",
        "text/html": "html",
        "application/pdf": "pdf",
    }
    return mapping.get(content_type.lower())


def log_file_access(
    supabase: Any,
    file_id: UUID,
    action: str,
    info: Optional[Dict[str, Any]] = None
):
    """Log file access (optional)."""
    try:
        supabase.client.table("file_access_log").insert({
            "file_id": str(file_id),
            "action": action,
            "info": info or {}
        }).execute()
    except Exception as e:
        # Logging is optional, don't fail the request
        print(f"Failed to log file access: {e}")


# Endpoints
@router.post("/init-upload", response_model=InitUploadResponse)
async def init_upload(request: InitUploadRequest):
    """
    Initialize a file upload.
    Creates a database record and returns a signed upload URL.
    """
    supabase = get_supabase()
    
    # Generate file ID
    file_id = uuid4()
    
    # Sanitize and determine extension
    sanitized_name = sanitize_filename(request.name)
    extension = get_extension_from_name(sanitized_name)
    if not extension:
        extension = get_extension_from_content_type(request.contentType)
    if not extension:
        extension = "bin"
    
    # Set path
    path = f"uploads/{file_id}.{extension}"
    
    # Insert file record
    try:
        file_data = {
            "id": str(file_id),
            "bucket": request.bucket,
            "path": path,
            "type": request.type,
            "name": sanitized_name,
            "content_type": request.contentType,
            "status": "pending",
            "metadata": request.metadata or {},
        }
        if request.parentId:
            file_data["parent_id"] = str(request.parentId)
        
        result = supabase.client.table("files").insert(file_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create file record")
        
        file_record = result.data[0]
        
        # Create signed upload URL
        try:
            upload_result = supabase.storage().from_(request.bucket).create_signed_upload_url(
                path
            )
            
            # Handle different response formats
            signed_url = None
            token = None
            
            if isinstance(upload_result, dict):
                signed_url = upload_result.get("signedUrl") or upload_result.get("signed_url") or upload_result.get("url")
                token = upload_result.get("token") or upload_result.get("path")
            elif hasattr(upload_result, "signedUrl"):
                signed_url = upload_result.signedUrl
                token = getattr(upload_result, "token", None)
            
            if not signed_url:
                # Clean up file record if signing fails
                supabase.client.table("files").delete().eq("id", str(file_id)).execute()
                raise HTTPException(
                    status_code=500,
                    detail="Failed to create signed upload URL: invalid response format"
                )
            
            # Log access
            log_file_access(
                supabase,
                file_id,
                "sign_upload",
                {"bucket": request.bucket, "path": path}
            )
            
            return InitUploadResponse(
                file=FileResponse(**file_record),
                upload={
                    "signedUrl": signed_url,
                    "token": token or "",
                }
            )
        except Exception as e:
            # Clean up file record if signing fails
            try:
                supabase.client.table("files").delete().eq("id", str(file_id)).execute()
            except:
                pass
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create signed upload URL: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error initializing upload: {str(e)}")


@router.post("/complete-upload", response_model=CompleteUploadResponse)
async def complete_upload(request: CompleteUploadRequest):
    """
    Complete a file upload.
    Verifies the file exists in storage and updates the database record.
    """
    supabase = get_supabase()
    
    # Fetch file record
    result = supabase.client.table("files").select("*").eq("id", str(request.fileId)).execute()
    
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_record = result.data[0]
    bucket = file_record["bucket"]
    path = file_record["path"]
    
    # Verify file exists in storage
    try:
        # List files in uploads/ directory and check if our file exists
        files_result = supabase.storage().from_(bucket).list("uploads/")
        
        # Extract filename from path
        filename = os.path.basename(path)
        file_exists = any(
            f.get("name") == filename
            for f in files_result
        )
        
        if not file_exists:
            raise HTTPException(
                status_code=404,
                detail=f"File not found in storage at {bucket}/{path}"
            )
        
        # Validate size if provided
        size_bytes = request.sizeBytes
        if size_bytes is not None:
            if size_bytes < 0:
                raise HTTPException(status_code=400, detail="sizeBytes must be non-negative")
            if size_bytes > MAX_FILE_SIZE_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds maximum of {MAX_FILE_SIZE_BYTES} bytes"
                )
        
        # Update file record
        update_data = {
            "status": "uploaded",
            "uploaded_at": datetime.utcnow().isoformat(),
        }
        if size_bytes is not None:
            update_data["size_bytes"] = size_bytes
        
        update_result = supabase.client.table("files").update(update_data).eq(
            "id", str(request.fileId)
        ).execute()
        
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update file record")
        
        updated_file = update_result.data[0]
        
        # Log access
        log_file_access(
            supabase,
            request.fileId,
            "complete_upload",
            {"size_bytes": size_bytes}
        )
        
        return CompleteUploadResponse(
            ok=True,
            file=FileResponse(**updated_file)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error completing upload: {str(e)}")


@router.post("/sign-download", response_model=SignDownloadResponse)
async def sign_download(request: SignDownloadRequest):
    """
    Generate a signed download URL for a file.
    """
    supabase = get_supabase()
    
    # Fetch file record
    result = supabase.client.table("files").select("*").eq("id", str(request.fileId)).execute()
    
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_record = result.data[0]
    
    if file_record["status"] != "uploaded":
        raise HTTPException(
            status_code=400,
            detail=f"File status is '{file_record['status']}', must be 'uploaded'"
        )
    
    bucket = file_record["bucket"]
    path = file_record["path"]
    
    try:
        # Create signed URL
        signed_url_result = supabase.storage().from_(bucket).create_signed_url(
            path,
            expires_in=request.expiresIn or 60
        )
        
        # Handle different response formats
        signed_url = None
        if isinstance(signed_url_result, dict):
            signed_url = signed_url_result.get("signedURL") or signed_url_result.get("signed_url") or signed_url_result.get("url")
        elif hasattr(signed_url_result, "signedURL"):
            signed_url = signed_url_result.signedURL
        elif isinstance(signed_url_result, str):
            signed_url = signed_url_result
        
        if not signed_url:
            raise HTTPException(
                status_code=500,
                detail="Failed to create signed download URL: invalid response format"
            )
        
        # Log access
        log_file_access(
            supabase,
            request.fileId,
            "sign_download",
            {"expires_in": request.expiresIn}
        )
        
        return SignDownloadResponse(
            signedUrl=signed_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error signing download: {str(e)}")


@router.get("", response_model=ListFilesResponse)
async def list_files(
    bucket: Optional[str] = Query(None, description="Filter by bucket"),
    parent_id: Optional[UUID] = Query(None, description="Filter by parent file ID"),
    status: str = Query("uploaded", description="Filter by status"),
    type: Optional[str] = Query(None, description="Filter by file type"),
    limit: int = Query(50, ge=1, le=100, description="Number of items per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    include_urls: bool = Query(False, description="Include signed URLs in response"),
    expires_in: int = Query(60, ge=1, le=3600, description="URL expiration in seconds"),
):
    """
    List files with optional filtering and pagination.
    Can optionally include signed download URLs.
    """
    supabase = get_supabase()
    
    # Validate filters
    if bucket and bucket not in ALLOWED_BUCKETS:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket must be one of: {', '.join(ALLOWED_BUCKETS)}"
        )
    if status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(ALLOWED_STATUSES)}"
        )
    if type and type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Type must be one of: {', '.join(ALLOWED_TYPES)}"
        )
    
    # Build query
    query = supabase.client.table("files").select("*")
    
    if bucket:
        query = query.eq("bucket", bucket)
    if parent_id:
        query = query.eq("parent_id", str(parent_id))
    if status:
        query = query.eq("status", status)
    if type:
        query = query.eq("type", type)
    
    # Order by created_at desc, paginate
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    
    try:
        result = query.execute()
        
        if not result.data:
            return ListFilesResponse(items=[], nextOffset=None)
        
        items = [FileListItem(**item) for item in result.data]
        
        # If include_urls, batch sign URLs
        if include_urls:
            # Group items by bucket for batch signing
            items_by_bucket: Dict[str, List[FileListItem]] = {}
            for item in items:
                if item.bucket not in items_by_bucket:
                    items_by_bucket[item.bucket] = []
                items_by_bucket[item.bucket].append(item)
            
            # Sign URLs for each bucket
            for bucket_name, bucket_items in items_by_bucket.items():
                paths = [item.path for item in bucket_items]
                
                try:
                    # Note: Supabase Python client may not have batch signing
                    # So we'll sign individually
                    signed_urls = {}
                    for item in bucket_items:
                        try:
                            signed_result = supabase.storage().from_(bucket_name).create_signed_url(
                                item.path,
                                expires_in=expires_in
                            )
                            # Handle different response formats
                            signed_url = None
                            if isinstance(signed_result, dict):
                                signed_url = signed_result.get("signedURL") or signed_result.get("signed_url") or signed_result.get("url")
                            elif hasattr(signed_result, "signedURL"):
                                signed_url = signed_result.signedURL
                            elif isinstance(signed_result, str):
                                signed_url = signed_result
                            
                            if signed_url:
                                signed_urls[item.path] = signed_url
                        except Exception as e:
                            print(f"Error signing URL for {item.path}: {e}")
                            # Continue without URL for this item
                    
                    # Attach URLs
                    for item in bucket_items:
                        item.signedUrl = signed_urls.get(item.path)
                        
                except Exception as e:
                    print(f"Error signing URLs for bucket {bucket_name}: {e}")
                    # Continue without URLs rather than failing
        
        # Determine next offset
        next_offset = None
        if len(items) == limit:
            next_offset = offset + limit
        
        return ListFilesResponse(items=items, nextOffset=next_offset)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")

