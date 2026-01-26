/**
 * R2 (S3-compatible) storage client for direct file uploads/downloads.
 * Uses presigned URLs from FastAPI backend.
 */

/**
 * Upload a file to R2 using a presigned URL.
 * 
 * @param signedUrl - The presigned upload URL from initUpload
 * @param file - The file to upload
 * @param contentType - The MIME content type
 * @returns Promise resolving when upload is complete
 */
export async function uploadToPresignedUrl(
  signedUrl: string,
  file: File,
  contentType: string
): Promise<void> {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }
}

/**
 * Download a file from a presigned URL.
 */
export async function downloadFromPresignedUrl(
  signedUrl: string
): Promise<Blob> {
  const response = await fetch(signedUrl);
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  
  return response.blob();
}

/**
 * Calculate SHA-256 hash of a file.
 * 
 * @param file - The file to hash
 * @returns Promise resolving to the hex-encoded SHA-256 hash
 */
export async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
