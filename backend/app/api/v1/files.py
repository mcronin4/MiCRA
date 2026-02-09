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
import asyncio
import time
from functools import partial
from ...auth.dependencies import User, get_current_user, get_supabase_client
from supabase import Client
from ...db.supabase import get_supabase
from ...storage.r2 import get_r2, R2_BUCKET
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])

# Simple in-memory cache for file list queries (avoids 3s+ Supabase round trips)
_list_cache: Dict[str, Any] = {}  # key -> {"data": result_data, "expires": timestamp}
LIST_CACHE_TTL = 120  # seconds — cache is invalidated on upload/delete mutations anyway


def _cache_key(user_id: str, bucket: Optional[str], status: str,
               file_type: Optional[str], ids: Optional[str],
               parent_id: Optional[str], limit: int, offset: int) -> str:
    return f"{user_id}:{bucket}:{status}:{file_type}:{ids}:{parent_id}:{limit}:{offset}"


def _get_cached(key: str) -> Optional[list]:
    entry = _list_cache.get(key)
    if entry and time.perf_counter() < entry["expires"]:
        return entry["data"]
    _list_cache.pop(key, None)
    return None


def _set_cached(key: str, data: list) -> None:
    _list_cache[key] = {"data": data, "expires": time.perf_counter() + LIST_CACHE_TTL}


def invalidate_list_cache() -> None:
    """Call after mutations (upload complete, delete) to clear stale cache."""
    _list_cache.clear()

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
        
        # "other" type accepts any content type
        if file_type == "other":
            return v
        
        if bucket == "media":
            allowed_prefixes = []
            if file_type == "image":
                allowed_prefixes = MEDIA_CONTENT_TYPES["image"]
            elif file_type == "video":
                allowed_prefixes = MEDIA_CONTENT_TYPES["video"]
            elif file_type == "audio":
                allowed_prefixes = MEDIA_CONTENT_TYPES["audio"]
            
            if allowed_prefixes and not any(v.startswith(prefix) for prefix in allowed_prefixes):
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
            
            if allowed_prefixes and not any(v.startswith(prefix) for prefix in allowed_prefixes):
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
async def check_hash(request: CheckHashRequest, user: User = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    """
    Check if a file with the given content hash already exists for the current user.
    Used for deduplication before upload.
    """
    user_id = user.sub
    
    try:
        # Check if a file with this hash exists for this user
        result = supabase.table("files").select("*").eq(
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
async def init_upload(
    request: InitUploadRequest, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Initialize a file upload.
    Creates a database record and returns a presigned upload URL for R2.
    Files are stored at users/{user_id}/{type}/{content_hash}.{extension}.
    """
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

    # Get type prefix
    type_prefix = get_type_prefix(request.type)
    
    # NEW: Isolated storage path: users/{user_id}/{type}/{hash}.{ext}
    path = f"users/{user_id}/{type_prefix}/{request.contentHash}.{extension}"

    # Check if THIS USER already has a file with this content hash (user-level deduplication)
    try:
        existing_file_result = supabase.table("files").select("*").eq(
            "user_id", user_id
        ).eq("content_hash", request.contentHash).neq("status", "deleted").execute()

        if existing_file_result.data and len(existing_file_result.data) > 0:
            # User already has this file - return existing record
            file_record = existing_file_result.data[0]
            logger.info(f"User {user_id} already has file with hash {request.contentHash}, returning existing record")

            # Create presigned upload URL (allows re-upload if status is pending)
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
        
        result = supabase.table("files").insert(file_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create file record")
        
        file_record = result.data[0]
        
    except Exception as insert_error:
        # Handle duplicate key constraint violation (user_id + path already exists)
        error_str = str(insert_error)
        if "duplicate key value violates unique constraint" in error_str.lower() or "23505" in error_str:
            logger.info(f"Duplicate path detected for user {user_id} and path {path}, fetching existing file")
            try:
                # Fetch the existing file record for THIS USER
                existing_file_result = supabase.table("files").select("*").eq(
                    "path", path
                ).execute()

                if existing_file_result.data and len(existing_file_result.data) > 0:
                    file_record = existing_file_result.data[0]
                    logger.info(f"Successfully retrieved existing file record for user {user_id} at {path}")
                else:
                    logger.error(f"Duplicate key error but file not found for user {user_id} at path {path}")
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
                supabase.table("files").delete().eq("id", str(file_id)).execute()
            except:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create presigned upload URL: {str(e)}"
        )


@router.post("/complete-upload", response_model=CompleteUploadResponse)
async def complete_upload(
    request: CompleteUploadRequest, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Complete a file upload.
    Verifies the file exists in R2 and updates the database record.
    User must own the file record.
    """
    r2 = get_r2()

    # Fetch file record - must belong to current user
    result = supabase.table("files").select("*").eq(
        "id", str(request.fileId)
    ).eq("user_id", user.sub).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")

    file_record = result.data[0]
    path = file_record["path"]

    # Verify file exists in R2 (Admin R2 client is fine here)
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

        # Update file record
        update_data = {
            "status": "uploaded",
            "uploaded_at": datetime.utcnow().isoformat(),
        }
        if size_bytes is not None:
            update_data["size_bytes"] = size_bytes

        update_result = supabase.table("files").update(update_data).eq(
            "id", str(request.fileId)
        ).execute()

        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update file record")

        invalidate_list_cache()
        return CompleteUploadResponse(
            ok=True,
            file=FileResponse(**update_result.data[0])
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
async def sign_download(
    request: SignDownloadRequest,
    user: User = Depends(get_current_user),
):
    """
    Generate a presigned download URL for a file in R2.
    """
    r2 = get_r2()
    supabase = get_supabase().client

    result = supabase.table("files").select("*").eq("id", str(request.fileId)).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")

    file_record = result.data[0]
    # Redundant check because RLS would filter it out, but safe to keep
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
async def delete_file(
    request: DeleteFileRequest, 
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Delete a file.
    Marks the database record as deleted and removes from R2.
    """
    r2 = get_r2()

    # Fetch file record - must belong to current user
    result = supabase.table("files").select("*").eq(
        "id", str(request.fileId)
    ).eq("user_id", user.sub).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="File not found")

    file_record = result.data[0]
    path = file_record["path"]

    try:
        # With isolated paths, we can always delete from R2 as long as we own the file record
        try:
            r2.client.delete_object(Bucket=R2_BUCKET, Key=path)
        except Exception as e:
            # Log but don't fail - the DB record will still be marked as deleted
            logger.warning(f"Failed to delete file from R2 at {path}: {e}")
        
        # Update file record to deleted status
        update_result = supabase.table("files").update({
            "status": "deleted",
            "deleted_at": datetime.utcnow().isoformat(),
        }).eq("id", str(request.fileId)).execute()
        
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update file record")
        
        invalidate_list_cache()
        return DeleteFileResponse(
            ok=True,
            deleted=True
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
    ids: Optional[str] = Query(None, description="Comma-separated list of file UUIDs to retrieve"),
    limit: int = Query(50, ge=1, le=100, description="Number of items per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    include_urls: bool = Query(False, description="Include signed URLs in response"),
    thumbnails_only: bool = Query(False, description="If true, prefers thumbnail URLs and skips main file URL if thumbnail exists"),
    expires_in: int = Query(60, ge=1, le=3600, description="URL expiration in seconds"),
):
    """
    List files for the current user with optional filtering and pagination.
    Can optionally include presigned download URLs.
    If 'ids' is provided, returns only those files.
    """
    r2 = get_r2()
    supabase = get_supabase().client

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

    # Check cache first
    ck = _cache_key(user.sub, bucket, status, type, ids,
                     str(parent_id) if parent_id else None, limit, offset)
    cached = _get_cached(ck)

    if cached is not None:
        result_data = cached
    else:
        # Build query (scope to current user automatically via RLS)
        # But explicitly adding user_id eq check is good defense in depth
        query = supabase.table("files").select("*").eq("user_id", user.sub)

        if bucket:
            query = query.eq("bucket", bucket)

        # If ids are provided, filter by those IDs
        if ids:
            id_list = [id.strip() for id in ids.split(",") if id.strip()]
            if id_list:
                query = query.in_("id", id_list)
        else:
            if parent_id:
                query = query.eq("parent_id", str(parent_id))
            if status:
                query = query.eq("status", status)
            if type:
                query = query.eq("type", type)

        # Order by created_at desc, paginate
        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

        # Run synchronous DB call in thread pool so it doesn't block the event loop
        # This allows parallel requests to execute concurrently
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, query.execute)
        result_data = result.data or []
        _set_cached(ck, result_data)

    try:
        if not result_data:
            return ListFilesResponse(items=[], nextOffset=None)

        # Filter out thumbnails from the main list (if mixed in)
        filtered_data = [
            item for item in result_data
            if not item.get("metadata", {}).get("is_thumbnail")
        ]
        
        items = [FileListItem(**item) for item in filtered_data]
        
        # Collect thumbnail IDs
        thumbnail_ids = set()
        for item in items:
            thumb_id = item.metadata.get("thumbnail_file_id")
            if thumb_id:
                thumbnail_ids.add(thumb_id)
        
        # Fetch thumbnail records if needed
        thumbnail_map = {}
        loop = asyncio.get_event_loop()
        if thumbnail_ids and include_urls:
            try:
                thumb_query = supabase.table("files").select("*").in_("id", list(thumbnail_ids))
                thumbs_result = await loop.run_in_executor(None, thumb_query.execute)
                for thumb in thumbs_result.data:
                    thumbnail_map[thumb["id"]] = thumb
            except Exception as e:
                print(f"Error fetching thumbnails: {e}")

        # If include_urls, generate presigned URLs for R2 in parallel
        if include_urls:

            async def sign_item(item: FileListItem):
                if item.status != "uploaded":
                    return
                thumb_id = item.metadata.get("thumbnail_file_id")
                has_thumbnail = False

                # Generate Thumbnail URL
                if thumb_id and thumb_id in thumbnail_map:
                    thumb_record = thumbnail_map[thumb_id]
                    if thumb_record["status"] == "uploaded":
                        try:
                            thumb_url = await loop.run_in_executor(
                                None,
                                partial(
                                    r2.client.generate_presigned_url,
                                    'get_object',
                                    Params={
                                        'Bucket': R2_BUCKET,
                                        'Key': thumb_record["path"],
                                    },
                                    ExpiresIn=expires_in,
                                ),
                            )
                            setattr(item, "thumbnailUrl", thumb_url)
                            has_thumbnail = True
                        except Exception as e:
                            print(f"Error signing thumbnail URL: {e}")

                # Generate Main URL
                should_generate_main = not thumbnails_only or not has_thumbnail

                if should_generate_main:
                    try:
                        signed_url = await loop.run_in_executor(
                            None,
                            partial(
                                r2.client.generate_presigned_url,
                                'get_object',
                                Params={
                                    'Bucket': R2_BUCKET,
                                    'Key': item.path,
                                },
                                ExpiresIn=expires_in,
                            ),
                        )
                        item.signedUrl = signed_url
                    except Exception as e:
                        print(f"Error signing URL for {item.path}: {e}")

            await asyncio.gather(*[sign_item(item) for item in items])
        
        # Determine next offset based on ORIGINAL result length (to keep pagination stable-ish)
        next_offset = None
        if len(result_data) == limit:
            next_offset = offset + limit
        
        return ListFilesResponse(items=items, nextOffset=next_offset)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")
