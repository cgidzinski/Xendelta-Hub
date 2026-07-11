/**
 * Server-side constants
 */

// Re-export sub-app constants
export {
  MAX_XENBOX_SIZE,
  XENBOX_CHUNK_SIZE,
} from "./xenbox";

export {
  MAX_RECIPAINT_ASSET_SIZE,
} from "./recipaint";

export {
  MAX_BLOG_ASSET_SIZE,
} from "./blog";

// File upload limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes (for avatars)
export const MAX_XENSPLIT_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB per expense image
export const MAX_XENSPLIT_IMAGES_PER_EXPENSE = 10;

// Image processing constants
export const AVATAR_WIDTH = 500;
export const AVATAR_HEIGHT = 500;
export const AVATAR_QUALITY = 90;
export const AVATAR_COMPRESSION_LEVEL = 9;

// Allowed MIME types for images
export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/heic",
  "image/heif"
] as const;

// Validation limits
export const VALIDATION_LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 50,
  EMAIL_MAX: 255,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
} as const;

// Timeout values (in milliseconds)
export const TIMEOUTS = {
  NOTIFICATION_DELAY: 300,
} as const;

// Database export/import (admin)
export const MAX_DATABASE_IMPORT_SIZE = 500 * 1024 * 1024; // 500MB in bytes (gzip-compressed dump)
export const DATABASE_IMPORT_CONFIRMATION_PHRASE = "RESTORE DATABASE";
export const DATABASE_BACKUP_DIR = "src/server/data/backups";
