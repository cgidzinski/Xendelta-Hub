import sharp from "sharp";
import {
  ALLOWED_IMAGE_MIMES,
  AVATAR_WIDTH,
  AVATAR_HEIGHT,
  AVATAR_QUALITY,
  AVATAR_COMPRESSION_LEVEL,
} from "../constants";
import { uploadToGCS, deleteFromGCS } from "./gcsUtils";

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Determine content type and extension from file extension (for images only)
 */
function detectFileType(file: Express.Multer.File): { contentType: string; ext: string } {
  const ext = getFileExtension(file.originalname);
  const extLower = ext.toLowerCase();

  let contentType: string;
  if (extLower === "jpg" || extLower === "jpeg") {
    contentType = "image/jpeg";
  } else if (extLower === "png") {
    contentType = "image/png";
  } else if (extLower === "gif") {
    contentType = "image/gif";
  } else {
    throw new Error(`Unsupported file type. Extension: ${ext || "none"}`);
  }

  return { contentType, ext };
}

/**
 * Determine content type and extension from file extension (for all file types)
 */
function detectFileTypeGeneric(file: Express.Multer.File): { contentType: string; ext: string } {
  const ext = getFileExtension(file.originalname);
  const extLower = ext.toLowerCase();

  // Use the file's mimetype if available, otherwise detect from extension
  let contentType = file.mimetype || "application/octet-stream";
  
  // Override with more specific types based on extension if mimetype is generic
  if (contentType === "application/octet-stream" || contentType === "application/x-msdownload") {
    if (extLower === "jpg" || extLower === "jpeg") {
      contentType = "image/jpeg";
    } else if (extLower === "png") {
      contentType = "image/png";
    } else if (extLower === "gif") {
      contentType = "image/gif";
    } else if (extLower === "pdf") {
      contentType = "application/pdf";
    } else if (extLower === "zip") {
      contentType = "application/zip";
    } else if (extLower === "txt") {
      contentType = "text/plain";
    } else if (extLower === "json") {
      contentType = "application/json";
    }
  }

  return { contentType, ext };
}

/**
 * Process image with Sharp based on content type
 */
async function processImage(
  buffer: Buffer,
  contentType: string,
  options: {
    width: number;
    height: number;
    fit: "inside" | "cover";
    quality: number;
    compressionLevel?: number;
  }
): Promise<Buffer> {
  // For GIFs, preserve the original file (including animation)
  if (contentType === "image/gif") {
    return buffer;
  }

  const sharpInstance = sharp(buffer).resize(options.width, options.height, {
    fit: options.fit,
    position: options.fit === "cover" ? "center" : undefined,
    withoutEnlargement: options.fit === "inside",
  });

  if (contentType === "image/jpeg") {
    return await sharpInstance.jpeg({ quality: options.quality }).toBuffer();
  } else if (contentType === "image/png") {
    return await sharpInstance
      .png({
        quality: options.quality,
        compressionLevel: options.compressionLevel || 9,
      })
      .toBuffer();
  }

  return buffer;
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

  // Detect file type (supports all file types)
  const { contentType, ext } = detectFileTypeGeneric(file);

  // Use the provided filename (should already include extension)
  // If filename doesn't have extension, add it
  const finalFilename = filename.includes(".") ? filename : `${filename}.${ext}`;

  // Upload to public GCS bucket in blog-assets folder
  const gcsPath = `blog-assets/${finalFilename}`;
  const publicUrl = await uploadToGCS(file.buffer, gcsPath, contentType) as string;

  return {
    url: publicUrl,
    filename: finalFilename,
    mimeType: contentType,
    size: file.buffer.length,
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
 * Upload recipaint asset to public GCS bucket
 * @param file - The uploaded file
 * @param filename - Filename with extension (e.g., "image-1234567890.jpg")
 * @returns Object with URL, filename, mimeType, and size
 */
export async function uploadRecipaintAsset(
  file: Express.Multer.File,
  filename: string
): Promise<{ url: string; filename: string; mimeType: string; size: number }> {
  if (!file.buffer) {
    throw new Error("File buffer is missing");
  }

  // Detect file type (images only)
  const { contentType, ext } = detectFileType(file);

  // Validate that it's an allowed image type
  if (!ALLOWED_IMAGE_MIMES.includes(contentType as any)) {
    throw new Error(`Recipaint asset must be an image. Detected type: ${contentType}, extension: ${ext}`);
  }

  // Use the provided filename (should already include extension)
  // If filename doesn't have extension, add it
  const finalFilename = filename.includes(".") ? filename : `${filename}.${ext}`;

  // Upload to public GCS bucket in recipaint-assets folder (no processing, upload as-is)
  const gcsPath = `recipaint-assets/${finalFilename}`;
  const publicUrl = await uploadToGCS(file.buffer, gcsPath, contentType) as string;

  return {
    url: publicUrl,
    filename: finalFilename,
    mimeType: contentType,
    size: file.buffer.length,
  };
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

  // Detect file type
  const { contentType, ext } = detectFileType(file);

  // Validate that it's an allowed image type
  if (!ALLOWED_IMAGE_MIMES.includes(contentType as any)) {
    throw new Error(`Avatar must be an image. Detected type: ${contentType}, extension: ${ext}`);
  }

  // Process image with Sharp
  const processedBuffer = await processImage(file.buffer, contentType, {
    width: AVATAR_WIDTH,
    height: AVATAR_HEIGHT,
    fit: "cover",
    quality: AVATAR_QUALITY,
    compressionLevel: AVATAR_COMPRESSION_LEVEL,
  });
  const finalSize = processedBuffer.length;

  // Upload to public GCS bucket with user_id as filename
  const gcsPath = `avatar/${userId}.${ext}`;
  const publicUrl = await uploadToGCS(processedBuffer, gcsPath, contentType) as string;

  return {
    url: publicUrl,
    mimeType: contentType,
    size: finalSize,
  };
}
