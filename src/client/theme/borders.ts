/**
 * Theme Border Utilities
 * Helper functions for consistent border radius usage
 */

import { BORDER_RADIUS } from "../constants/design";

/**
 * Get border radius value by key
 */
export const getBorderRadius = (key: keyof typeof BORDER_RADIUS): number => {
  return BORDER_RADIUS[key];
};

/**
 * Convert border radius value to MUI border radius string (in px)
 */
export const toMuiBorderRadius = (px: number): string => {
  return `${px}px`;
};

