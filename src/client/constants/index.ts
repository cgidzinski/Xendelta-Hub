/**
 * Client-side constants
 */

// Cache times (in milliseconds)
export const CACHE_TIMES = {
  USER_CONVERSATIONS: 0, // Always consider stale
  USER_PROFILE: 5 * 60 * 1000, // 5 minutes
  USER_NOTIFICATIONS: 2 * 60 * 1000, // 2 minutes
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
} as const;

// Admin role verification interval (in milliseconds)
export const ADMIN_VERIFICATION_INTERVAL = 30000; // 30 seconds

