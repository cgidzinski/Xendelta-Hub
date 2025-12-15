/**
 * Blog asset API response (with URL path for frontend)
 */
export interface BlogAssetResponse {
  path: string; // URL path (e.g., "/assets/{filename}")
  type: string; // MIME type (e.g., "image/jpeg", "application/pdf", "video/mp4")
  mediaId?: string; // Media document ID (for saving back to database)
}

