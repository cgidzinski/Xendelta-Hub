/**
 * Theme Type Definitions
 * TypeScript module augmentation for MUI theme
 */

import "@mui/material/styles";
import { SPACING, BORDER_RADIUS, ANIMATION_DURATION, Z_INDEX } from "../constants/design";

declare module "@mui/material/styles" {
  interface Theme {
    custom: {
      spacing: typeof SPACING;
      borderRadius: typeof BORDER_RADIUS;
      animationDuration: typeof ANIMATION_DURATION;
      zIndex: typeof Z_INDEX;
    };
  }

  interface ThemeOptions {
    custom?: {
      spacing?: typeof SPACING;
      borderRadius?: typeof BORDER_RADIUS;
      animationDuration?: typeof ANIMATION_DURATION;
      zIndex?: typeof Z_INDEX;
    };
  }
}

