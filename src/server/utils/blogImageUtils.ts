import fs from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ALLOWED_IMAGE_MIMES, MAX_FILE_SIZE } from "../constants";

export const BLOG_IMAGES_DIR = path.join(process.cwd(), "src", "server", "public", "blog-images");

// Blog image dimensions
const BLOG_IMAGE_MAX_WIDTH = 1200;
const BLOG_IMAGE_MAX_HEIGHT = 800;
const BLOG_IMAGE_QUALITY = 85;

// Ensure blog images directory exists
async function ensureBlogImagesDir() {
  await fs.mkdir(BLOG_IMAGES_DIR, { recursive: true });
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

/**
 * Save uploaded blog image file with unique ID
 */
export async function saveBlogImage(
  file: Express.Multer.File,
  imageId: string
): Promise<string> {
  await ensureBlogImagesDir();

  // Read file buffer to validate magic bytes
  const fileBuffer = await fs.readFile(file.path);

  // Validate file type using magic bytes
  const fileType = await fileTypeFromBuffer(fileBuffer);

  if (!fileType) {
    await fs.unlink(file.path).catch(() => {});
    throw new Error("Unable to determine file type");
  }

  // Only allow image types
  if (!ALLOWED_IMAGE_MIMES.includes(fileType.mime as any)) {
    await fs.unlink(file.path).catch(() => {});
    throw new Error(`Invalid file type: ${fileType.mime}. Only images are allowed.`);
  }

  // Preserve original format
  const ext = getExtensionFromMime(fileType.mime);
  const filePath = path.join(BLOG_IMAGES_DIR, `${imageId}.${ext}`);

  // For GIFs, preserve the original file (including animation)
  // For JPEG/PNG, use sharp to resize and optimize
  if (fileType.mime === "image/gif") {
    // Save GIF as-is to preserve animation
    await fs.copyFile(file.path, filePath);
    await fs.unlink(file.path).catch(() => {});
  } else {
    // Re-encode JPEG/PNG using sharp to resize and optimize
    const sharpInstance = sharp(fileBuffer).resize(BLOG_IMAGE_MAX_WIDTH, BLOG_IMAGE_MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    });

    if (fileType.mime === "image/jpeg") {
      await sharpInstance.jpeg({ quality: BLOG_IMAGE_QUALITY }).toFile(filePath);
    } else if (fileType.mime === "image/png") {
      await sharpInstance.png({ quality: BLOG_IMAGE_QUALITY, compressionLevel: 9 }).toFile(filePath);
    }

    // Clean up temp file
    await fs.unlink(file.path).catch(() => {});
  }

  return `/blog-images/${imageId}.${ext}`;
}

/**
 * Delete a specific blog image by imageId
 */
export async function deleteBlogImageById(imageId: string): Promise<void> {
  await ensureBlogImagesDir();

  const files = await fs.readdir(BLOG_IMAGES_DIR);
  const imageFiles = files.filter((file) => file.startsWith(`${imageId}.`));

  for (const file of imageFiles) {
    const filePath = path.join(BLOG_IMAGES_DIR, file);
    await fs.unlink(filePath).catch(() => {
      // Ignore errors if file doesn't exist
    });
  }
}

/**
 * Delete blog image file (legacy - for backward compatibility)
 */
export async function deleteBlogImage(postId: string): Promise<void> {
  await deleteBlogImageById(postId);
}

/**
 * Get blog image path for a post
 */
export function getBlogImagePath(imageField: string | undefined): string | null {
  if (!imageField) {
    return null;
  }

  // If it's a local path, return it
  if (imageField.startsWith("/blog-images/")) {
    return imageField;
  }

  return null;
}
