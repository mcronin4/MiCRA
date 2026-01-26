/**
 * CORS debugging utilities for R2 uploads
 */

/**
 * Check if an error is likely a CORS error
 */
export function isCorsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("cors") ||
    message.includes("access-control") ||
    message.includes("cross-origin")
  );
}

/**
 * Get CORS debugging information
 */
export function getCorsDebugInfo(signedUrl: string): {
  r2Domain: string;
  frontendOrigin: string;
  isSameOrigin: boolean;
  debugSteps: string[];
} {
  let r2Domain = "unknown";
  try {
    const url = new URL(signedUrl);
    r2Domain = url.hostname;
  } catch {
    r2Domain = "invalid-url";
  }
  
  const frontendOrigin = window.location.origin;
  const isSameOrigin = signedUrl.startsWith(frontendOrigin);
  
  const debugSteps = [
    `1. Open browser DevTools (F12 or Cmd+Option+I)`,
    `2. Go to the Network tab`,
    `3. Try uploading a file again`,
    `4. Look for the failed request to: ${r2Domain}`,
    `5. Click on the failed request`,
    `6. Check the "Headers" tab for CORS-related headers`,
    `7. Look for error messages mentioning "CORS" or "Access-Control"`,
    `8. Check the "Console" tab for CORS error messages`,
    ``,
    `Expected CORS headers from R2:`,
    `  - Access-Control-Allow-Origin: ${frontendOrigin} (or *)`,
    `  - Access-Control-Allow-Methods: PUT, GET, HEAD, etc.`,
    `  - Access-Control-Allow-Headers: Content-Type, etc.`,
    ``,
    `To fix CORS:`,
    `  1. Go to Cloudflare Dashboard > R2 > Your Bucket`,
    `  2. Go to Settings > CORS Policy`,
    `  3. Add CORS configuration allowing:`,
    `     - Allowed Origins: ${frontendOrigin} (or * for dev)`,
    `     - Allowed Methods: PUT, GET, HEAD, POST`,
    `     - Allowed Headers: Content-Type, *`,
    `     - Max Age: 3600`,
  ];
  
  return {
    r2Domain,
    frontendOrigin,
    isSameOrigin,
    debugSteps,
  };
}

/**
 * Log CORS debugging information to console
 */
export function logCorsDebugInfo(signedUrl: string, error?: Error): void {
  const debugInfo = getCorsDebugInfo(signedUrl);
  
  console.group("🔍 CORS Debugging Information");
  console.log("R2 Domain:", debugInfo.r2Domain);
  console.log("Frontend Origin:", debugInfo.frontendOrigin);
  console.log("Same Origin:", debugInfo.isSameOrigin);
  
  if (error) {
    console.log("Error:", error.message);
    console.log("Is CORS Error:", isCorsError(error));
  }
  
  console.group("Debugging Steps:");
  debugInfo.debugSteps.forEach(step => console.log(step));
  console.groupEnd();
  
  console.groupEnd();
}
