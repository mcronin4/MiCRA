/**
 * Utility functions for working with images in the image bucket.
 */

import { ImageBucketItem } from "@/lib/stores/workflowStore";

/**
 * Get base64 data from an ImageBucketItem.
 * If signedUrl is available but base64 is not, fetches the image and converts to base64.
 * 
 * @param image - The image bucket item
 * @returns Promise resolving to base64 data URL
 */
export async function getImageBase64(image: ImageBucketItem): Promise<string> {
  // If base64 is already available, use it
  if (image.base64) {
    return image.base64;
  }

  // If signedUrl is available, fetch and convert to base64
  if (image.signedUrl) {
    try {
      const response = await fetch(image.signedUrl);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error(`Failed to fetch image from URL: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error("Image has no base64 data or signedUrl");
}

/**
 * Get image source URL for display.
 * Prefers signedUrl, falls back to base64.
 * 
 * @param image - The image bucket item
 * @returns Image source URL (empty string if no source available)
 */
export function getImageSrc(image: ImageBucketItem): string {
  const src = image.signedUrl || image.base64;
  if (!src) {
    console.warn(`Image ${image.id} has no source URL or base64 data`);
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"; // 1x1 transparent placeholder
  }
  return src;
}
