import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ALLOWED_IMAGE_MIMES, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "../constants";
import {
  uploadToGCS,
  deleteFromGCS,
  getGcsPath,
} from "./gcsUtils";

// Blog asset dimensions (for images)
const BLOG_ASSET_MAX_WIDTH = 1200;
const BLOG_ASSET_MAX_HEIGHT = 800;
const BLOG_ASSET_QUALITY = 85;

// Get file extension from MIME type
function getExtensionFromMime(mime: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
  };
  return mimeToExt[mime] || "png";
}

import { BlogAsset } from "../types";

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Save uploaded blog asset file with unique ID to GCS
 * @param file - The uploaded file
 * @param assetId - Unique identifier for the asset
 * @param postId - Blog post ID to organize assets in folders
 * @returns Object with path and type (MIME type)
 */
export async function saveBlogAsset(
  file: Express.Multer.File,
  assetId: string,
  postId: string
): Promise<BlogAsset> {
  // With memory storage, file.buffer is available directly
  if (!file.buffer) {
    throw new Error("File buffer is missing");
  }

  if (!postId) {
    throw new Error("Post ID is required to upload assets");
  }

  // Get file extension from filename (primary method)
  const fileExtension = getFileExtension(file.originalname);
  
  // Try to determine file type using magic bytes (optional, for processing)
  let fileType = await fileTypeFromBuffer(file.buffer).catch(() => null);

  // Determine content type and extension
  let ext: string;
  let contentType: string;
  
  // Use fileType if available, otherwise fall back to mimetype or extension
  if (fileType) {
    contentType = fileType.mime;
    ext = fileExtension || fileType.ext || "bin";
  } else {
    // Fallback to mimetype from multer or infer from extension
    contentType = file.mimetype || "application/octet-stream";
    ext = fileExtension || "bin";
  }

  // For images, validate and process. For other files, upload as-is
  let processedBuffer: Buffer;

  if (ALLOWED_IMAGE_MIMES.includes(contentType as any)) {
    // Process images with sharp
    if (!ext || !IMAGE_EXTENSIONS.includes(ext as any)) {
      // If extension doesn't match, use MIME-based extension
      ext = getExtensionFromMime(contentType);
    }

    // For GIFs, preserve the original file (including animation)
    // For JPEG/PNG, use sharp to resize and optimize
    if (contentType === "image/gif" || ext === "gif") {
      // Use GIF as-is to preserve animation
      processedBuffer = file.buffer;
    } else {
      // Re-encode JPEG/PNG using sharp to resize and optimize
      const sharpInstance = sharp(file.buffer).resize(BLOG_ASSET_MAX_WIDTH, BLOG_ASSET_MAX_HEIGHT, {
        fit: "inside",
        withoutEnlargement: true,
      });

      if (contentType === "image/jpeg" || ext === "jpg" || ext === "jpeg") {
        processedBuffer = await sharpInstance.jpeg({ quality: BLOG_ASSET_QUALITY }).toBuffer();
      } else if (contentType === "image/png" || ext === "png") {
        processedBuffer = await sharpInstance.png({ quality: BLOG_ASSET_QUALITY, compressionLevel: 9 }).toBuffer();
      } else {
        processedBuffer = file.buffer;
      }
    }
  } else {
    // For non-image files, use original buffer
    processedBuffer = file.buffer;
  }

  const gcsPath = getGcsPath("blog-assets", `${postId}/${assetId}.${ext}`);

  // Upload to GCS
  await uploadToGCS(processedBuffer, gcsPath, contentType);

  return {
    path: gcsPath,
    type: contentType,
  };
}

/**
 * Delete a specific blog asset by assetId from GCS
 * @param assetId - Unique identifier for the asset
 * @param postId - Blog post ID to locate the asset in the correct folder
 */
export async function deleteBlogAssetById(assetId: string, postId: string): Promise<void> {
  if (!postId) {
    throw new Error("Post ID is required to delete assets");
  }

  // Try to delete any existing asset file for this assetId
  // Check for common image extensions and other common file extensions
  const extensions = ["jpg", "jpeg", "png", "gif", "pdf", "doc", "docx", "txt", "zip"];
  
  for (const ext of extensions) {
    const gcsPath = getGcsPath("blog-assets", `${postId}/${assetId}.${ext}`);
    await deleteFromGCS(gcsPath).catch(() => {
      // Ignore errors if file doesn't exist
    });
  }
}

/**
 * Delete blog asset file (legacy - for backward compatibility)
 */
export async function deleteBlogAsset(postId: string): Promise<void> {
  await deleteBlogAssetById(postId, postId);
}

/**
 * Get blog asset path for a post
 * Returns GCS path or local path (for backward compatibility)
 */
export function getBlogAssetPath(assetField: string | undefined): string | null {
  if (!assetField) {
    return null;
  }

  // If it's a GCS path, return it
  if (assetField.startsWith("blog-assets/")) {
    return assetField;
  }

  // If it's a local path, return it
  if (assetField.startsWith("/blog-assets/")) {
    return assetField;
  }

  return null;
}

/**
 * Convert GCS blog asset path to URL path for frontend
 * Converts "blog-assets/{postId}/{assetId}.ext" to "/assets/blog-asset/{assetId}?postId={postId}"
 */
export function getBlogAssetUrl(gcsPath: string | undefined, postId?: string): string | null {
  if (!gcsPath) {
    return null;
  }

  // If it's a GCS path like "blog-assets/{postId}/{assetId}.ext"
  if (gcsPath.startsWith("blog-assets/")) {
    const parts = gcsPath.split("/");
    if (parts.length >= 3) {
      // Format: blog-assets/{postId}/{assetId}.ext
      const postIdFromPath = parts[1];
      const filename = parts[2];
      const assetId = filename.split(".")[0];
      return `/assets/blog-asset/${assetId}?postId=${postIdFromPath}`;
    } else if (parts.length === 2) {
      // Format: blog-assets/{assetId}.ext
      const filename = parts[1];
      const assetId = filename.split(".")[0];
      const postIdParam = postId ? `?postId=${postId}` : "";
      return `/assets/blog-asset/${assetId}${postIdParam}`;
    }
  }

  // If it's already a URL path, ensure it has postId
  if (gcsPath.startsWith("/assets/blog-asset/")) {
    // Check if it already has postId query parameter
    if (gcsPath.includes("?postId=")) {
      return gcsPath;
    }
    // Add postId if provided
    if (postId) {
      return `${gcsPath}?postId=${postId}`;
    }
    return gcsPath;
  }
  if (gcsPath.startsWith("/blog-assets/")) {
    return gcsPath;
  }

  // If it's an external URL, return it
  if (gcsPath.startsWith("http://") || gcsPath.startsWith("https://")) {
    return gcsPath;
  }

  return null;
}

