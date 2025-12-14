/**
 * Server-side constants
 */

// File upload limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

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
] as const;

// Default avatar path
export const DEFAULT_AVATAR_PATH = "/avatars/default-avatar.png";

// Validation limits
export const VALIDATION_LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 50,
  EMAIL_MAX: 255,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  MESSAGE_MAX: 10000,
  CONVERSATION_NAME_MAX: 100,
  NOTIFICATION_TITLE_MAX: 200,
} as const;

// Timeout values (in milliseconds)
export const TIMEOUTS = {
  NOTIFICATION_DELAY: 300,
} as const;

