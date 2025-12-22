/**
 * File management API client for Supabase Storage integration.
 * Handles upload initialization, completion, download signing, and listing.
 */

import { apiClient } from './client';

export interface InitUploadRequest {
  bucket: 'media' | 'docs';
  type: 'image' | 'video' | 'text' | 'pdf' | 'other';
  contentType: string;
  name: string;
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
}

export interface ListFilesResponse {
  items: FileListItem[];
  nextOffset?: number;
}

export interface ListFilesParams {
  bucket?: 'media' | 'docs';
  parentId?: string;
  status?: 'pending' | 'uploaded' | 'failed' | 'deleted';
  type?: 'image' | 'video' | 'text' | 'pdf' | 'other';
  limit?: number;
  offset?: number;
  includeUrls?: boolean;
  expiresIn?: number;
}

/**
 * Initialize a file upload.
 * Returns a signed upload URL and file metadata.
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
  
  const queryString = searchParams.toString();
  const url = `/v1/files${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.request<ListFilesResponse>(url, {
    method: 'GET',
  });
}

