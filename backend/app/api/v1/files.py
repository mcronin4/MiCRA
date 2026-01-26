"""
File management endpoints for Cloudflare R2 (S3-compatible) storage.
Handles upload initialization, completion, download signing, listing, and deletion.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from uuid import UUID, uuid4
import os
import re
import logging
from ...auth.dependencies import User, get_current_user
from ...db.supabase import get_supabase
from ...storage.r2 import get_r2, R2_BUCKET
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])

# Constants
ALLOWED_BUCKETS = {"media", "docs"}  # Kept for API compatibility, but all use "micra" bucket
ALLOWED_TYPES = {"image", "video", "text", "pdf", "audio", "other"}
ALLOWED_STATUSES = {"pending", "uploaded", "failed", "deleted"}

# Content type mappings
MEDIA_CONTENT_TYPES = {
    "image": ["image/"],
    "video": ["video/"],
    "audio": ["audio/"],
}
DOCS_CONTENT_TYPES = {
    "text": ["text/", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],  # docx
    "pdf": ["application/pdf"],
}

# Max file size: 500MB
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024

# Presigned URL expiration (default 1 hour for uploads, configurable for downloads)
DEFAULT_UPLOAD_EXPIRATION = 3600  # 1 hour


# Pydantic Models
class CheckHashRequest(BaseModel):
    contentHash: str = Field(..., alias="contentHash", description="SHA-256 hash of file content")


class CheckHashResponse(BaseModel):
    exists: bool
    file: Optional[Dict[str, Any]] = None  # Existing file record if found


class InitUploadRequest(BaseModel):
    bucket: str = Field(..., description="Bucket name: 'media' or 'docs' (for compatibility)")
    type: str = Field(..., description="File type: 'image', 'video', 'text', 'pdf', 'audio', or 'other'")
    contentType: str = Field(..., alias="contentType", description="MIME content type")
    name: str = Field(..., description="File name")
    contentHash: str = Field(..., alias="contentHash", description="SHA-256 hash of file content")
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
            elif file_type == "audio":
                allowed_prefixes = MEDIA_CONTENT_TYPES["audio"]
            
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
    contentHash: Optional[str] = Field(None, alias="content_hash")
    status: str
    metadata: Dict[str, Any]
    createdAt: datetime = Field(..., alias="created_at")
    uploadedAt: Optional[datetime] = Field(None, alias="uploaded_at")
    deletedAt: Optional[datetime] = Field(None, alias="deleted_at")
    
    class Config:
        populate_by_name = True


class InitUploadResponse(BaseModel):
    file: FileResponse
    upload: Dict[str, str]  # { signedUrl, token } - token is empty for S3


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


class DeleteFileRequest(BaseModel):
    fileId: UUID = Field(..., alias="fileId")
    
    class Config:
        populate_by_name = True


class DeleteFileResponse(BaseModel):
    ok: bool
    deleted: bool  # Whether the physical file was deleted from R2


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
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/wav": "wav",
        "audio/wave": "wav",
        "audio/ogg": "ogg",
        "audio/aac": "aac",
        "audio/flac": "flac",
        "text/plain": "txt",
        "text/markdown": "md",
        "text/html": "html",
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    }
    return mapping.get(content_type.lower())


def get_type_prefix(file_type: str) -> str:
    """Get the storage prefix for a file type."""
    # Map types to their storage prefixes
    type_map = {
        "image": "images",
        "video": "videos",
        "audio": "audio",
        "text": "text",
        "pdf": "text",  # PDFs go to text/ prefix
        "other": "other",
    }
    return type_map.get(file_type, "other")


# Endpoints
@router.post("/check-hash", response_model=CheckHashResponse)
async def check_hash(request: CheckHashRequest, user: User = Depends(get_current_user)):
    """
    Check if a file with the given content hash already exists for the current user.
    Used for deduplication before upload.
    """
    supabase = get_supabase()
    user_id = user.sub
    
    try:
        # Check if a file with this hash exists for this user
        result = supabase.client.table("files").select("*").eq(
            "user_id", user_id
        ).eq("content_hash", request.contentHash).eq("status", "uploaded").execute()
        
        if result.data and len(result.data) > 0:
            # Return the first matching file
            return CheckHashResponse(
                exists=True,
                file=result.data[0]
            )
        
        return CheckHashResponse(exists=False, file=None)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking hash: {str(e)}")


@router.post("/init-upload", response_model=InitUploadResponse)
async def init_upload(request: InitUploadRequest, user: User = Depends(get_current_user)):
    """
    Initialize a file upload.
    Creates a database record and returns a presigned upload URL for R2.
    Files are stored at {type}/{content_hash}.{extension}.
    """
    supabase = get_supabase()
    r2 = get_r2()
    user_id = user.sub

    # Generate file ID
    file_id = uuid4()

    # Sanitize and determine extension
    sanitized_name = sanitize_filename(request.name)
    extension = get_extension_from_content_type(request.contentType)
    if not extension:
        extension = get_extension_from_name(sanitized_name)
    if not extension:
        extension = "bin"

    # Get type prefix and build path: {type}/{content_hash}.{extension}
    type_prefix = get_type_prefix(request.type)
    path = f"{type_prefix}/{request.contentHash}.{extension}"

    # Check if a file with this path already exists (regardless of user)
    # This handles the case where another user has already uploaded the same file
    try:
        existing_file_result = supabase.client.table("files").select("*").eq(
            "path", path
        ).execute()
        
        if existing_file_result.data and len(existing_file_result.data) > 0:
            # File already exists - reuse it (could be uploaded or pending)
            file_record = existing_file_result.data[0]
            logger.info(f"File with path {path} already exists, reusing existing record")
            
            # Create presigned upload URL (allows re-upload if needed, or skip if already uploaded)
            try:
                signed_url = r2.client.generate_presigned_url(
                    'put_object',
                    Params={
                        'Bucket': R2_BUCKET,
                        'Key': path,
                        'ContentType': request.contentType,
                    },
                    ExpiresIn=DEFAULT_UPLOAD_EXPIRATION
                )
                
                return InitUploadResponse(
                    file=FileResponse(**file_record),
                    upload={
                        "signedUrl": signed_url,
                        "token": "",  # S3 doesn't use tokens
                    }
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create presigned upload URL: {str(e)}"
                )
    except HTTPException:
        raise
    except Exception as e:
        # If checking for existing file fails, continue with normal flow
        # (don't fail the request, just log and continue)
        logger.warning(f"Error checking for existing file: {str(e)}")

    # Insert file record (file doesn't exist yet)
    file_record = None
    try:
        file_data = {
            "id": str(file_id),
            "user_id": user_id,
            "bucket": request.bucket,  # Keep for compatibility
            "path": path,
            "type": request.type,
            "name": sanitized_name,
            "content_type": request.contentType,
            "content_hash": request.contentHash,
            "status": "pending",
            "metadata": request.metadata or {},
        }
        if request.parentId:
            file_data["parent_id"] = str(request.parentId)
        
        result = supabase.client.table("files").insert(file_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create file record")
        
        file_record = result.data[0]
        
    except Exception as insert_error:
        # Handle duplicate key constraint violation (path already exists)
        # This can happen due to race conditions or if the check above missed it
        error_str = str(insert_error)
        if "duplicate key value violates unique constraint" in error_str.lower() or "23505" in error_str:
            logger.info(f"Duplicate path detected for {path} during insert, fetching existing file")
            try:
                # Fetch the existing file record
                existing_file_result = supabase.client.table("files").select("*").eq(
                    "path", path
                ).execute()
                
                if existing_file_result.data and len(existing_file_result.data) > 0:
                    file_record = existing_file_result.data[0]
                    logger.info(f"Successfully retrieved existing file record for {path}")
                else:
                    # Unexpected: duplicate key but file not found
                    logger.error(f"Duplicate key error but file not found for path {path}")
                    raise HTTPException(
                        status_code=409,
                        detail="File with this content already exists but could not be retrieved. Please try again."
                    )
            except HTTPException:
                raise
            except Exception as check_error:
                logger.error(f"Error fetching existing file after duplicate key: {str(check_error)}")
                raise HTTPException(
                    status_code=409,
                    detail="File with this content already exists. Please try again."
                )
        else:
            # Re-raise if it's not a duplicate key error
            raise HTTPException(status_code=500, detail=f"Error initializing upload: {error_str}")
    
    # Ensure we have a file_record at this point
    if not file_record:
        raise HTTPException(status_code=500, detail="Failed to obtain file record")
    
    # Create presigned upload URL for R2
    try:
        signed_url = r2.client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': R2_BUCKET,
                'Key': path,
                'ContentType': request.contentType,
            },
            ExpiresIn=DEFAULT_UPLOAD_EXPIRATION
        )
        logger.debug(f"Generated presigned URL for path: {path}, URL length: {len(signed_url)}")
        
        return InitUploadResponse(
            file=FileResponse(**file_record),
            upload={
                "signedUrl": signed_url,
                "token": "",  # S3 doesn't use tokens
            }
        )
    except Exception as e:
        # Clean up file record if signing fails (only if we created a new one)
        if 'file_id' in locals():
            try:
                supabase.client.table("files").delete().eq("id", str(file_id)).execute()
            except:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create presigned upload URL: {str(e)}"
        )


@router.post("/complete-upload", response_model=CompleteUploadResponse)
async def complete_upload(request: CompleteUploadRequest, user: User = Depends(get_current_user)):
    """
    Complete a file upload.
    Verifies the file exists in R2 and updates the database record.
    """
    supabase = get_supabase()
    r2 = get_r2()

    # Fetch file record
    result = supabase.client.table("files").select("*").eq("id", str(request.fileId)).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")

    file_record = result.data[0]
    path = file_record["path"]
    file_status = file_record.get("status")
    
    # If file already belongs to another user but is uploaded, allow completion
    # This handles the case where a duplicate file was detected during init_upload
    file_owner = file_record.get("user_id")
    is_owner = file_owner == user.sub
    
    # If file is already uploaded and belongs to another user, we can still return it
    # (the file was already uploaded, so no need to update)
    if file_status == "uploaded" and not is_owner:
        # File already exists and is uploaded by another user
        # Just return it without updating (since we can't update another user's file)
        return CompleteUploadResponse(
            ok=True,
            file=FileResponse(**file_record)
        )
    
    # For files owned by the current user, or pending files, proceed normally
    if not is_owner and file_status != "pending":
        raise HTTPException(status_code=403, detail="Not authorized to complete this upload")
    
    # Verify file exists in R2
    try:
        r2.client.head_object(Bucket=R2_BUCKET, Key=path)
        
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
        
        # Update file record (only if we own it or it's pending)
        if is_owner or file_status == "pending":
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
        else:
            # Use existing file record
            updated_file = file_record
        
        return CompleteUploadResponse(
            ok=True,
            file=FileResponse(**updated_file)
        )
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        if error_code == '404' or error_code == 'NoSuchKey':
            raise HTTPException(
                status_code=404,
                detail=f"File not found in R2 at {path}"
            )
        raise HTTPException(status_code=500, detail=f"Error verifying file in R2: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error completing upload: {str(e)}")


@router.post("/sign-download", response_model=SignDownloadResponse)
async def sign_download(request: SignDownloadRequest, user: User = Depends(get_current_user)):
    """
    Generate a presigned download URL for a file in R2.
    """
    supabase = get_supabase()
    r2 = get_r2()

    result = supabase.client.table("files").select("*").eq("id", str(request.fileId)).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")

    file_record = result.data[0]
    if file_record.get("user_id") != user.sub:
        raise HTTPException(status_code=403, detail="Not authorized to access this file")

    if file_record["status"] != "uploaded":
        raise HTTPException(
            status_code=400,
            detail=f"File status is '{file_record['status']}', must be 'uploaded'"
        )
    
    path = file_record["path"]
    expires_in = request.expiresIn or 60
    
    try:
        # Create presigned URL for download
        signed_url = r2.client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': R2_BUCKET,
                'Key': path,
            },
                ExpiresIn=expires_in
            )
            
        return SignDownloadResponse(
            signedUrl=signed_url
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error signing download: {str(e)}")


@router.post("/delete", response_model=DeleteFileResponse)
async def delete_file(request: DeleteFileRequest, user: User = Depends(get_current_user)):
    """
    Delete a file.
    Deletes the database record. Only deletes from R2 if no other users have files with the same content_hash.
    """
    supabase = get_supabase()
    r2 = get_r2()

    # Fetch file record
    result = supabase.client.table("files").select("*").eq("id", str(request.fileId)).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")

    file_record = result.data[0]
    if file_record.get("user_id") != user.sub:
        raise HTTPException(status_code=403, detail="Not authorized to delete this file")

    path = file_record["path"]
    content_hash = file_record.get("content_hash")
    
    try:
        # Check if other users have files with the same content_hash
        should_delete_from_r2 = False
        if content_hash:
            other_files_result = supabase.client.table("files").select("id").eq(
                "content_hash", content_hash
            ).neq("id", str(request.fileId)).eq("status", "uploaded").execute()
            
            # If no other files with this hash exist, we can delete from R2
            if not other_files_result.data or len(other_files_result.data) == 0:
                should_delete_from_r2 = True
        
        # Delete from R2 if no other users reference it
        if should_delete_from_r2:
            try:
                r2.client.delete_object(Bucket=R2_BUCKET, Key=path)
            except Exception as e:
                # Log but don't fail - the DB record will still be deleted
                print(f"Warning: Failed to delete file from R2: {e}")
        
        # Update file record to deleted status
        update_result = supabase.client.table("files").update({
            "status": "deleted",
            "deleted_at": datetime.utcnow().isoformat(),
        }).eq("id", str(request.fileId)).execute()
        
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update file record")
        
        return DeleteFileResponse(
            ok=True,
            deleted=should_delete_from_r2
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")


@router.get("", response_model=ListFilesResponse)
async def list_files(
    user: User = Depends(get_current_user),
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
    List files for the current user with optional filtering and pagination.
    Can optionally include presigned download URLs.
    """
    supabase = get_supabase()
    r2 = get_r2()

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
    
    # Build query (scope to current user)
    query = supabase.client.table("files").select("*").eq("user_id", user.sub)

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
        
        # If include_urls, generate presigned URLs for R2
        if include_urls:
            for item in items:
                if item.status == "uploaded":
                    try:
                        signed_url = r2.client.generate_presigned_url(
                            'get_object',
                            Params={
                                'Bucket': R2_BUCKET,
                                'Key': item.path,
                            },
                            ExpiresIn=expires_in
                        )
                        item.signedUrl = signed_url
                    except Exception as e:
                        print(f"Error signing URL for {item.path}: {e}")
                        # Continue without URL for this item
        
        # Determine next offset
        next_offset = None
        if len(items) == limit:
            next_offset = offset + limit
        
        return ListFilesResponse(items=items, nextOffset=next_offset)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")
