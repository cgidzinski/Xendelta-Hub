/**
 * Design System Constants
 * Standardized values for spacing, borders, animations, z-index, and breakpoints
 */

// Spacing scale (4px base unit)
export const SPACING = {
  xs: 4,    // 4px
  sm: 8,    // 8px
  md: 16,   // 16px
  lg: 24,   // 24px
  xl: 32,   // 32px
  xxl: 48,  // 48px
  xxxl: 64, // 64px
} as const;

// Border radius values
export const BORDER_RADIUS = {
  none: 0,
  sm: 4,   // 4px
  md: 8,   // 8px
  lg: 12,  // 12px
  xl: 16,  // 16px
  full: 9999, // Full circle
} as const;

// Animation durations (in milliseconds)
export const ANIMATION_DURATION = {
  fast: 150,
  normal: 250,
  slow: 350,
  slower: 500,
} as const;

// Z-index scale
export const Z_INDEX = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modalBackdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
} as const;

// Breakpoints (if custom needed beyond MUI defaults)
export const BREAKPOINTS = {
  xs: 0,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
} as const;

