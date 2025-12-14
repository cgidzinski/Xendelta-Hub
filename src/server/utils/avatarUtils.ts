import fs from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export const AVATARS_DIR = path.join(process.cwd(), "src", "server", "public", "avatars");
const DEFAULT_AVATAR = "/avatars/default-avatar.png";

// Ensure avatars directory exists
async function ensureAvatarsDir() {
  await fs.mkdir(AVATARS_DIR, { recursive: true });
}

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

// Download avatar from external URL and save to local storage with security validation
export async function downloadAvatarFromUrl(
  url: string,
  userId: string
): Promise<string> {
  await ensureAvatarsDir();

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
  const filePath = path.join(AVATARS_DIR, `${userId}.${ext}`);

  // For GIFs, preserve the original file (including animation)
  // For JPEG/PNG, use sharp to resize and strip metadata for security
  if (fileType.mime === "image/gif") {
    // Save GIF as-is to preserve animation
    await fs.writeFile(filePath, buffer);
  } else {
    // Re-encode JPEG/PNG using sharp to strip metadata and resize
    try {
      const sharpInstance = sharp(buffer)
        .resize(AVATAR_WIDTH, AVATAR_HEIGHT, {
          fit: "cover",
          position: "center",
        });

      if (fileType.mime === "image/jpeg") {
        await sharpInstance.jpeg({ quality: AVATAR_QUALITY }).toFile(filePath);
      } else if (fileType.mime === "image/png") {
        await sharpInstance.png({ quality: AVATAR_QUALITY, compressionLevel: AVATAR_COMPRESSION_LEVEL }).toFile(filePath);
      }
    } catch (error) {
      throw new Error("Invalid or corrupted image file");
    }
  }

  return `/avatars/${userId}.${ext}`;
}

// Save uploaded file to local storage with security validation
export async function saveAvatarFile(
  file: Express.Multer.File,
  userId: string
): Promise<string> {
  await ensureAvatarsDir();

  // Delete old avatar if exists
  await deleteAvatarFile(userId);

  // Read file buffer to validate magic bytes
  const fileBuffer = await fs.readFile(file.path);
  
  // Validate file type using magic bytes (not just MIME type)
  const fileType = await fileTypeFromBuffer(fileBuffer);
  
  if (!fileType) {
    await fs.unlink(file.path).catch(() => {}); // Clean up temp file
    throw new Error("Unable to determine file type");
  }

  // Only allow image types
  const allowedMimes = ["image/jpeg", "image/png", "image/gif"];
  if (!allowedMimes.includes(fileType.mime)) {
    await fs.unlink(file.path).catch(() => {}); // Clean up temp file
    throw new Error(`Invalid file type: ${fileType.mime}. Only images are allowed.`);
  }

  // Preserve original format
  const ext = getExtensionFromMime(fileType.mime);
  const filePath = path.join(AVATARS_DIR, `${userId}.${ext}`);

  // For GIFs, preserve the original file (including animation)
  // For JPEG/PNG, use sharp to resize and strip metadata for security
  if (fileType.mime === "image/gif") {
    // Save GIF as-is to preserve animation
    await fs.copyFile(file.path, filePath);
    await fs.unlink(file.path).catch(() => {}); // Clean up temp file
  } else {
    // Re-encode JPEG/PNG using sharp to strip metadata and resize
    try {
      const sharpInstance = sharp(fileBuffer)
        .resize(500, 500, {
          fit: "cover",
          position: "center",
        });

      if (fileType.mime === "image/jpeg") {
        await sharpInstance.jpeg({ quality: 90 }).toFile(filePath);
      } else if (fileType.mime === "image/png") {
        await sharpInstance.png({ quality: 90, compressionLevel: 9 }).toFile(filePath);
      }

      // Clean up temp file
      await fs.unlink(file.path).catch(() => {});
    } catch (error) {
      // If sharp fails, the file is likely corrupted or not a valid image
      await fs.unlink(file.path).catch(() => {});
      throw new Error("Invalid or corrupted image file");
    }
  }

  return `/avatars/${userId}.${ext}`;
}

// Delete old avatar file
export async function deleteAvatarFile(userId: string): Promise<void> {
  await ensureAvatarsDir();

  // Try to find and delete any existing avatar file for this user
  // Check for all possible extensions (jpg, png, gif)
  const files = await fs.readdir(AVATARS_DIR);
  const userAvatarFiles = files.filter((file) => file.startsWith(`${userId}.`));

  for (const file of userAvatarFiles) {
    const filePath = path.join(AVATARS_DIR, file);
    await fs.unlink(filePath).catch(() => {
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

  // If it's already a local path, return it
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

// Check if avatar is local file
export function isLocalAvatar(avatarField: string | undefined): boolean {
  if (!avatarField) return false;
  return avatarField.startsWith("/avatars/");
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

