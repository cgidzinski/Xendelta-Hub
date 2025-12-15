/**
 * Blog post asset stored in database
 */
export interface BlogAsset {
  path: string; // GCS path (e.g., "blog-assets/{postId}/{assetId}.ext")
  type: string; // MIME type (e.g., "image/jpeg", "application/pdf", "video/mp4")
}

