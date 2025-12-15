/**
 * Blog asset upload response
 */
export interface BlogAssetUploadResponse {
  assetPath: string; // GCS path
  assetType: string; // MIME type (e.g., "image/jpeg", "application/pdf", "video/mp4")
  assetId: string; // Unique asset identifier
}

