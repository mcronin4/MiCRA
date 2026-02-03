/**
 * File management API client for R2 (S3-compatible) storage integration.
 * Handles upload initialization, completion, download signing, listing, and deletion.
 */

import { apiClient } from './client';

export interface CheckHashRequest {
  contentHash: string;
}

export interface CheckHashResponse {
  exists: boolean;
  file?: FileResponse | null;
}

export interface InitUploadRequest {
  bucket: 'media' | 'docs';
  type: 'image' | 'video' | 'text' | 'pdf' | 'audio' | 'other';
  contentType: string;
  name: string;
  contentHash: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface FileResponse {
  id: string;
  bucket: string;
  path: string;
  type: string;
  sizeBytes?: number;
  name: string;
  parentId?: string;
  contentType: string;
  contentHash?: string;
  status: 'pending' | 'uploaded' | 'failed' | 'deleted';
  metadata: Record<string, unknown>;
  createdAt: string;
  uploadedAt?: string;
  deletedAt?: string;
}

export interface InitUploadResponse {
  file: FileResponse;
  upload: {
    signedUrl: string;
    token: string;
  };
}

export interface CompleteUploadRequest {
  fileId: string;
  sizeBytes?: number;
}

export interface CompleteUploadResponse {
  ok: boolean;
  file: FileResponse;
}

export interface SignDownloadRequest {
  fileId: string;
  expiresIn?: number;
}

export interface SignDownloadResponse {
  signedUrl: string;
}

export interface FileListItem extends FileResponse {
  signedUrl?: string;
  thumbnailUrl?: string;
}

export interface ListFilesResponse {
  items: FileListItem[];
  nextOffset?: number;
}

export interface ListFilesParams {
  bucket?: 'media' | 'docs';
  parentId?: string;
  status?: 'pending' | 'uploaded' | 'failed' | 'deleted';
  type?: 'image' | 'video' | 'text' | 'pdf' | 'audio' | 'other';
  limit?: number;
  offset?: number;
  includeUrls?: boolean;
  expiresIn?: number;
  ids?: string[];
}

export interface DeleteFileRequest {
  fileId: string;
}

export interface DeleteFileResponse {
  ok: boolean;
  deleted: boolean;
}

/**
 * Check if a file with the given content hash already exists for the current user.
 * Used for deduplication before upload.
 */
export async function checkHash(
  request: CheckHashRequest
): Promise<CheckHashResponse> {
  return apiClient.request<CheckHashResponse>('/v1/files/check-hash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

/**
 * Initialize a file upload.
 * Returns a presigned upload URL and file metadata.
 */
export async function initUpload(
  request: InitUploadRequest
): Promise<InitUploadResponse> {
  return apiClient.request<InitUploadResponse>('/v1/files/init-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

/**
 * Complete a file upload after uploading to the signed URL.
 * Verifies the file exists and updates the database record.
 */
export async function completeUpload(
  request: CompleteUploadRequest
): Promise<CompleteUploadResponse> {
  return apiClient.request<CompleteUploadResponse>('/v1/files/complete-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

/**
 * Get a signed download URL for a file.
 */
export async function signDownload(
  request: SignDownloadRequest
): Promise<SignDownloadResponse> {
  return apiClient.request<SignDownloadResponse>('/v1/files/sign-download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

/**
 * List files with optional filtering and pagination.
 */
export async function listFiles(
  params: ListFilesParams = {}
): Promise<ListFilesResponse> {
  const searchParams = new URLSearchParams();

  if (params.bucket) searchParams.append('bucket', params.bucket);
  if (params.parentId) searchParams.append('parent_id', params.parentId);
  if (params.status) searchParams.append('status', params.status);
  if (params.type) searchParams.append('type', params.type);
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.offset) searchParams.append('offset', params.offset.toString());
  if (params.includeUrls !== undefined) {
    searchParams.append('include_urls', params.includeUrls.toString());
  }
  if (params.expiresIn) searchParams.append('expires_in', params.expiresIn.toString());
  if (params.ids && params.ids.length > 0) searchParams.append('ids', params.ids.join(','));

  const queryString = searchParams.toString();
  const url = `/v1/files${queryString ? `?${queryString}` : ''}`;

  return apiClient.request<ListFilesResponse>(url, {
    method: 'GET',
  });
}

/**
 * Delete a file.
 * Deletes the database record. Only deletes from R2 if no other users have files with the same content_hash.
 */
export async function deleteFile(
  request: DeleteFileRequest
): Promise<DeleteFileResponse> {
  return apiClient.request<DeleteFileResponse>('/v1/files/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

