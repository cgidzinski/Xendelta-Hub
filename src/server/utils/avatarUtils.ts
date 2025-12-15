import fs from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import {
  uploadToGCS,
  deleteFromGCS,
  getGcsPath,
} from "./gcsUtils";
import {
  AVATAR_WIDTH,
  AVATAR_HEIGHT,
  AVATAR_QUALITY,
  AVATAR_COMPRESSION_LEVEL,
  ALLOWED_IMAGE_MIMES,
  DEFAULT_AVATAR_PATH,
} from "../constants";

export const AVATARS_DIR = path.join(process.cwd(), "src", "server", "public", "avatars");
const DEFAULT_AVATAR = DEFAULT_AVATAR_PATH;

// Get file extension from URL or filename
function getFileExtension(urlOrFilename: string): string {
  let pathname = urlOrFilename;
  if (urlOrFilename.startsWith("http://") || urlOrFilename.startsWith("https://")) {
    const url = new URL(urlOrFilename);
    pathname = url.pathname;
  } else {
    pathname = urlOrFilename;
  }
  const ext = path.extname(pathname).toLowerCase().replace(".", "");
  return ext || "png"; // Default to png if no extension
}

// Get MIME type from extension
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
  };
  return mimeTypes[ext.toLowerCase()] || "image/png";
}

// Get file extension from MIME type
function getExtensionFromMime(mime: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
  };
  return mimeToExt[mime] || "png";
}

// Download avatar from external URL and save to GCS with security validation
export async function downloadAvatarFromUrl(
  url: string,
  userId: string
): Promise<string> {
  // Delete old avatar if exists
  await deleteAvatarFile(userId);

  // Fetch the image
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download avatar: ${response.statusText}`);
  }

  // Check if response is an image
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.startsWith("image/")) {
    throw new Error("URL does not point to an image");
  }

  // Get image buffer
  const buffer = Buffer.from(await response.arrayBuffer());

  // Validate file type using magic bytes
  const fileType = await fileTypeFromBuffer(buffer);
  
  if (!fileType) {
    throw new Error("Unable to determine file type");
  }

  // Only allow image types
  if (!ALLOWED_IMAGE_MIMES.includes(fileType.mime as any)) {
    throw new Error(`Invalid file type: ${fileType.mime}. Only images are allowed.`);
  }

  const ext = getExtensionFromMime(fileType.mime);
  const gcsPath = getGcsPath("avatars", `${userId}.${ext}`);

  // For GIFs, preserve the original file (including animation)
  // For JPEG/PNG, use sharp to resize and strip metadata for security
  let processedBuffer: Buffer;
  if (fileType.mime === "image/gif") {
    // Use GIF as-is to preserve animation
    processedBuffer = buffer;
  } else {
    // Re-encode JPEG/PNG using sharp to strip metadata and resize
    const sharpInstance = sharp(buffer)
      .resize(AVATAR_WIDTH, AVATAR_HEIGHT, {
        fit: "cover",
        position: "center",
      });

    if (fileType.mime === "image/jpeg") {
      processedBuffer = await sharpInstance.jpeg({ quality: AVATAR_QUALITY }).toBuffer();
    } else if (fileType.mime === "image/png") {
      processedBuffer = await sharpInstance.png({ quality: AVATAR_QUALITY, compressionLevel: AVATAR_COMPRESSION_LEVEL }).toBuffer();
    } else {
      processedBuffer = buffer;
    }
  }

  // Upload to GCS
  await uploadToGCS(processedBuffer, gcsPath, fileType.mime);

  return gcsPath;
}

// Save uploaded file to GCS with security validation
export async function saveAvatarFile(
  file: Express.Multer.File,
  userId: string
): Promise<string> {
  // Delete old avatar if exists
  await deleteAvatarFile(userId);

  // With memory storage, file.buffer is available directly
  if (!file.buffer) {
    throw new Error("File buffer is missing");
  }

  // Validate file type using magic bytes (not just MIME type)
  const fileType = await fileTypeFromBuffer(file.buffer);
  
  if (!fileType) {
    throw new Error("Unable to determine file type");
  }

  // Only allow image types
  const allowedMimes = ["image/jpeg", "image/png", "image/gif"];
  if (!allowedMimes.includes(fileType.mime)) {
    throw new Error(`Invalid file type: ${fileType.mime}. Only images are allowed.`);
  }

  // Preserve original format
  const ext = getExtensionFromMime(fileType.mime);
  const gcsPath = getGcsPath("avatars", `${userId}.${ext}`);

  // For GIFs, preserve the original file (including animation)
  // For JPEG/PNG, use sharp to resize and strip metadata for security
  let processedBuffer: Buffer;
  if (fileType.mime === "image/gif") {
    // Use GIF as-is to preserve animation
    processedBuffer = file.buffer;
  } else {
    // Re-encode JPEG/PNG using sharp to strip metadata and resize
    const sharpInstance = sharp(file.buffer)
      .resize(AVATAR_WIDTH, AVATAR_HEIGHT, {
        fit: "cover",
        position: "center",
      });

    if (fileType.mime === "image/jpeg") {
      processedBuffer = await sharpInstance.jpeg({ quality: AVATAR_QUALITY }).toBuffer();
    } else if (fileType.mime === "image/png") {
      processedBuffer = await sharpInstance.png({ quality: AVATAR_QUALITY, compressionLevel: AVATAR_COMPRESSION_LEVEL }).toBuffer();
    } else {
      processedBuffer = file.buffer;
    }
  }

  // Upload to GCS
  await uploadToGCS(processedBuffer, gcsPath, fileType.mime);

  return gcsPath;
}

// Delete old avatar file from GCS
export async function deleteAvatarFile(userId: string): Promise<void> {
  // Try to delete any existing avatar file for this user
  // Check for all possible extensions (jpg, png, gif)
  const extensions = ["jpg", "png", "gif"];
  
  for (const ext of extensions) {
    const gcsPath = getGcsPath("avatars", `${userId}.${ext}`);
    await deleteFromGCS(gcsPath).catch(() => {
      // Ignore errors if file doesn't exist
    });
  }
}

// Get avatar path for a user
export function getAvatarPath(userId: string): string {
  return path.join(AVATARS_DIR, `${userId}.*`);
}

// Get avatar URL from user's avatar field
export function getAvatarUrl(avatarField: string | undefined): string {
  if (!avatarField) {
    return DEFAULT_AVATAR;
  }

  // If it's a GCS path, return server proxy URL
  if (isGcsPath(avatarField)) {
    // Extract userId from path like "avatars/userId.ext"
    const filename = avatarField.split("/").pop() || "";
    const userId = filename.split(".")[0];
    return `/assets/avatar/${userId}`;
  }

  // If it's already a local path, return it (for default avatar)
  if (avatarField.startsWith("/avatars/")) {
    return avatarField;
  }

  // If it's an external URL (legacy), return it
  if (avatarField.startsWith("http://") || avatarField.startsWith("https://")) {
    return avatarField;
  }

  // Default fallback
  return DEFAULT_AVATAR;
}

// Check if avatar is local file (not GCS)
export function isLocalAvatar(avatarField: string | undefined): boolean {
  if (!avatarField) return false;
  // Local paths start with /avatars/ (for default avatar)
  // GCS paths are like "avatars/userId.ext" (no leading slash)
  return avatarField.startsWith("/avatars/");
}

// Check if avatar is stored in GCS
export function isGcsPath(avatarField: string | undefined): boolean {
  if (!avatarField) return false;
  // GCS paths are like "avatars/userId.ext" or "blog-assets/assetId.ext"
  return avatarField.startsWith("avatars/") || avatarField.startsWith("blog-assets/");
}

// Get local file path for serving
export async function getLocalAvatarPath(avatarField: string | undefined): Promise<string | null> {
  if (!isLocalAvatar(avatarField)) {
    return null;
  }

  // Extract filename from /avatars/filename
  const filename = avatarField.replace("/avatars/", "");
  const filePath = path.join(AVATARS_DIR, filename);

  // Check if file exists, if not try .png extension (new format)
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    // Try .png extension if original doesn't exist
    const pngPath = path.join(AVATARS_DIR, filename.replace(/\.[^.]+$/, ".png"));
    try {
      await fs.access(pngPath);
      return pngPath;
    } catch {
      return null;
    }
  }
}

// Get MIME type for avatar file
export function getAvatarMimeType(avatarPath: string): string {
  const ext = path.extname(avatarPath).toLowerCase().replace(".", "");
  return getMimeType(ext);
}

// Get file extension from avatar path
export function getAvatarExtension(avatarPath: string): string {
  return path.extname(avatarPath).toLowerCase().replace(".", "") || "png";
}

