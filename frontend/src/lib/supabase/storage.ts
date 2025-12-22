/**
 * Supabase Storage client for direct file uploads/downloads.
 * Uses signed URLs from FastAPI backend.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client (client-side, uses anon key)
// Note: For signed URL uploads, we don't need auth, but we need the client
// You should set these in your environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set'
      );
    }
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
}

/**
 * Upload a file to Supabase Storage using a signed URL.
 * 
 * @param signedUrl - The signed upload URL from initUpload
 * @param token - The upload token from initUpload
 * @param file - The file to upload
 * @param contentType - The MIME content type
 * @returns Promise resolving when upload is complete
 */
export async function uploadToSignedUrl(
  signedUrl: string,
  token: string,
  file: File,
  contentType: string
): Promise<void> {
  // Method 1: Direct fetch to signed URL (works if token is in URL or headers)
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      // Some Supabase signed URLs include the token in the URL, others need it in headers
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }
}

/**
 * Alternative: Upload using Supabase Storage client directly
 * This method uses the storage.from().uploadToSignedUrl() method if available
 */
export async function uploadFileToStorage(
  bucket: string,
  path: string,
  file: File,
  token: string,
  contentType: string
): Promise<void> {
  const supabase = getSupabaseClient();
  
  // Use Supabase Storage client's uploadToSignedUrl method
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, {
      contentType,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

/**
 * Download a file from a signed URL.
 */
export async function downloadFromSignedUrl(
  signedUrl: string
): Promise<Blob> {
  const response = await fetch(signedUrl);
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  
  return response.blob();
}

