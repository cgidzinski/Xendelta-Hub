/**
 * Server-side constants
 */

// File upload limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes (for avatars)
export const MAX_BLOG_ASSET_SIZE = 50 * 1024 * 1024; // 50MB in bytes (for blog assets)
export const MAX_RECIPAINT_ASSET_SIZE = 10 * 1024 * 1024; // 10MB in bytes (for recipaint assets)
export const MAX_XENBOX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB in bytes (for xenbox)
export const XENBOX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB in bytes (chunk size for xenbox uploads)

// Image processing constants
export const AVATAR_WIDTH = 500;
export const AVATAR_HEIGHT = 500;
export const AVATAR_QUALITY = 90;
export const AVATAR_COMPRESSION_LEVEL = 9;

// Allowed MIME types for images
export const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif"] as const;

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
