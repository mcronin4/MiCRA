/**
 * HEIC/HEIF detection utility.
 * MiCRA does not support HEIC uploads - users should convert to JPEG first.
 */

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

export function isHeicFile(file: File): boolean {
  if (HEIC_MIME_TYPES.has(file.type.toLowerCase())) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? HEIC_EXTENSIONS.has(ext) : false;
}

export function getHeicErrorMessage(fileName: string): string {
  return `Cannot upload "${fileName}" - HEIC format is not supported. Please convert to JPEG first:

• iOS/Mac: Open photo → Share → Save as JPEG
• Windows: Use free converter or save from Photos app
• Or change iPhone settings: Camera → Formats → Most Compatible`;
}
