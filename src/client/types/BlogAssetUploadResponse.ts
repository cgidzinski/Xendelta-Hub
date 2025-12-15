/**
 * Blog asset upload response
 */
export interface BlogAssetUploadResponse {
  status: boolean;
  message: string;
  data: {
    assetPath: string; // GCS path
    assetType: string; // MIME type (e.g., "image/jpeg", "application/pdf", "video/mp4")
    assetId: string; // Unique asset identifier
  };
}

