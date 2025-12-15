import { BlogAsset } from "./BlogAsset";

/**
 * Blog post asset with client-side metadata
 */
export interface BlogAssetWithMetadata extends BlogAsset {
  gcsPath?: string; // GCS path for saving to database
  id: string; // Unique identifier
  isFeatured: boolean; // Whether this is the featured image
}

