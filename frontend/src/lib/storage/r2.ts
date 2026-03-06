/**
 * R2 (S3-compatible) storage client for direct file uploads/downloads.
 * Uses presigned URLs from FastAPI backend.
 */

import { logCorsDebugInfo, isCorsError } from './corsDebug';

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
  let response: Response;
  try {
    response = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });
  } catch (error) {
    // Handle network errors (including CORS)
    const errorMessage = error instanceof Error ? error.message : "Unknown network error";
    let detailedMessage = `Failed to upload to R2 storage: ${errorMessage}`;
    
    // Check for CORS-related errors
    const likelyCorsError = isCorsError(error);
    
    if (likelyCorsError) {
      // Log detailed CORS debugging information
      logCorsDebugInfo(signedUrl, error as Error);
      
      // Extract domain from signed URL for debugging
      let r2Domain = "unknown";
      try {
        const url = new URL(signedUrl);
        r2Domain = url.hostname;
      } catch {
        // URL parsing failed, use partial
        r2Domain = signedUrl.substring(0, 100);
      }
      
      detailedMessage = `CORS error while uploading to R2. ` +
        `The R2 bucket needs to be configured to allow requests from ${window.location.origin}. ` +
        `R2 endpoint: ${r2Domain}. ` +
        `See console for detailed CORS debugging steps. ` +
        `Error: ${errorMessage}`;
    }
    
    console.error("R2 upload failed:", {
      url: signedUrl.substring(0, 100) + "...", // Log partial URL for debugging
      r2Domain: (() => {
        try {
          return new URL(signedUrl).hostname;
        } catch {
          return "unknown";
        }
      })(),
      origin: window.location.origin,
      contentType,
      fileSize: file.size,
      fileName: file.name,
      error: detailedMessage,
      originalError: errorMessage,
      isCorsError: likelyCorsError,
    });
    
    throw new Error(detailedMessage);
  }

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {
      errorText = response.statusText || "Unknown error";
    }
    const errorMessage = `Upload to R2 failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;
    console.error("R2 upload error response:", {
      status: response.status,
      statusText: response.statusText,
      errorText,
    });
    throw new Error(errorMessage);
  }
}

export interface MultipartUploadProgress {
  completedParts: number;
  totalParts: number;
  bytesUploaded: number;
  totalBytes: number;
}

export interface MultipartPartResult {
  partNumber: number;
  etag: string;
}

/**
 * Upload a large file using multipart upload with concurrent chunk uploads.
 *
 * @param parts - Array of {partNumber, signedUrl} from initMultipartUpload
 * @param file - The file to upload
 * @param chunkSize - Size of each chunk in bytes (must match backend MULTIPART_CHUNK_SIZE)
 * @param concurrency - Number of concurrent chunk uploads
 * @param onProgress - Callback for upload progress
 * @param signal - AbortSignal for cancellation
 * @returns Array of {partNumber, etag} to pass to completeMultipartUpload
 */
export async function uploadMultipart(
  parts: { partNumber: number; signedUrl: string }[],
  file: File,
  chunkSize: number,
  concurrency: number = 4,
  onProgress?: (progress: MultipartUploadProgress) => void,
  signal?: AbortSignal,
): Promise<MultipartPartResult[]> {
  const results: MultipartPartResult[] = [];
  let bytesUploaded = 0;
  const totalParts = parts.length;

  // Sort parts by partNumber to ensure correct slicing
  const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  // Upload parts with bounded concurrency
  let partIndex = 0;

  async function uploadNextPart(): Promise<void> {
    while (partIndex < sortedParts.length) {
      if (signal?.aborted) {
        throw new DOMException('Upload cancelled', 'AbortError');
      }

      const currentIndex = partIndex++;
      const part = sortedParts[currentIndex];

      const start = (part.partNumber - 1) * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const response = await fetch(part.signedUrl, {
        method: 'PUT',
        body: chunk,
        signal,
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {
          errorText = response.statusText;
        }
        throw new Error(
          `Failed to upload part ${part.partNumber}: ${response.status} ${errorText}`,
        );
      }

      const etag = response.headers.get('ETag');
      if (!etag) {
        throw new Error(`No ETag returned for part ${part.partNumber}`);
      }

      results.push({ partNumber: part.partNumber, etag });
      bytesUploaded += end - start;

      onProgress?.({
        completedParts: results.length,
        totalParts,
        bytesUploaded,
        totalBytes: file.size,
      });
    }
  }

  // Launch `concurrency` workers
  const workers = Array.from({ length: Math.min(concurrency, totalParts) }, () =>
    uploadNextPart(),
  );

  await Promise.all(workers);

  return results.sort((a, b) => a.partNumber - b.partNumber);
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
