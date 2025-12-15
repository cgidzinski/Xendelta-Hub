/**
 * Media Utilities
 * Functions for handling media uploads and storage
 */

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ALLOWED_IMAGE_MIMES, AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_QUALITY, AVATAR_COMPRESSION_LEVEL } from "../constants";
import {
  uploadToPublicGCS,
  deleteFromPublicGCS,
} from "./gcsUtils";
import { MediaType } from "../types";

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

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Upload blog asset to public GCS bucket
 * @param file - The uploaded file
 * @param filename - Filename with extension (e.g., "image-1234567890.jpg")
 * @returns Object with URL, filename, mimeType, and size
 */
export async function uploadBlogAsset(
  file: Express.Multer.File,
  filename: string
): Promise<{ url: string; filename: string; mimeType: string; size: number }> {
  if (!file.buffer) {
    throw new Error("File buffer is missing");
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

  // Process based on media type
  let processedBuffer: Buffer;
  let finalSize: number;

  // For blog assets, process images with sharp, others as-is
    if (ALLOWED_IMAGE_MIMES.includes(contentType as any)) {
      if (!ext || !["jpg", "jpeg", "png", "gif"].includes(ext)) {
        ext = getExtensionFromMime(contentType);
      }

      // For GIFs, preserve the original file (including animation)
      if (contentType === "image/gif" || ext === "gif") {
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
    finalSize = processedBuffer.length;

  // Use the provided filename (should already include extension)
  // If filename doesn't have extension, add it
  const finalFilename = filename.includes(".") ? filename : `${filename}.${ext}`;
  
  // Upload to public GCS bucket in blog-assets folder
  const gcsPath = `blog-assets/${finalFilename}`;
  const publicUrl = await uploadToPublicGCS(processedBuffer, gcsPath, contentType);

  return {
    url: publicUrl,
    filename: finalFilename,
    mimeType: contentType,
    size: finalSize,
  };
}

/**
 * Generate a unique filename from original filename
 */
export function generateUniqueFilename(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const baseName = originalName.substring(0, originalName.lastIndexOf(".")) || "file";
  const sanitizedBase = baseName.replace(/[^a-zA-Z0-9-_]/g, "-").substring(0, 50);
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  return `${sanitizedBase}-${timestamp}-${random}.${ext}`;
}

/**
 * Upload avatar file directly to GCS (no Media DB entry)
 * @param file - The uploaded file
 * @param userId - User ID (used as filename)
 * @returns Object with mimeType and size
 */
export async function uploadAvatarFile(
  file: Express.Multer.File,
  userId: string
): Promise<{ url: string; mimeType: string; size: number }> {
  if (!file.buffer) {
    throw new Error("File buffer is missing");
  }

  // Get file extension from original filename
  const fileExtension = getFileExtension(file.originalname);
  
  // Try to determine file type using magic bytes
  let fileType = await fileTypeFromBuffer(file.buffer).catch(() => null);

  // Determine content type and extension
  let ext: string;
  let contentType: string;
  
  if (fileType) {
    contentType = fileType.mime;
    ext = fileExtension || fileType.ext || "png";
  } else {
    contentType = file.mimetype || "image/png";
    ext = fileExtension || "png";
  }

  // Process avatar image
  let processedBuffer: Buffer;
  let finalSize: number;

  if (!ALLOWED_IMAGE_MIMES.includes(contentType as any)) {
    throw new Error("Avatar must be an image");
  }
  
  ext = getExtensionFromMime(contentType);
  const sharpInstance = sharp(file.buffer)
    .resize(AVATAR_WIDTH, AVATAR_HEIGHT, {
      fit: "cover",
      position: "center",
    });

  if (contentType === "image/jpeg") {
    processedBuffer = await sharpInstance.jpeg({ quality: AVATAR_QUALITY }).toBuffer();
  } else if (contentType === "image/png") {
    processedBuffer = await sharpInstance.png({ quality: AVATAR_QUALITY, compressionLevel: AVATAR_COMPRESSION_LEVEL }).toBuffer();
  } else {
    processedBuffer = file.buffer;
  }
  finalSize = processedBuffer.length;

  // Upload to public GCS bucket with user_id as filename
  const gcsPath = `avatar/${userId}.${ext}`;
  const publicUrl = await uploadToPublicGCS(processedBuffer, gcsPath, contentType);

  return {
    url: publicUrl,
    mimeType: contentType,
    size: finalSize,
  };
}


