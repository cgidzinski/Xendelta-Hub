/**
 * Theme Spacing Utilities
 * Helper functions for consistent spacing usage
 */

import { SPACING } from "../constants/design";

/**
 * Get spacing value by key
 */
export const getSpacing = (key: keyof typeof SPACING): number => {
  return SPACING[key];
};

/**
 * Convert spacing value to MUI spacing string (multiplies by 0.25rem)
 * MUI spacing uses 8px base, so we divide by 8
 */
export const toMuiSpacing = (px: number): number => {
  return px / 8;
};

