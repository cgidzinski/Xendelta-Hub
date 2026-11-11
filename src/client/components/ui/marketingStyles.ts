// Styling for the public pages (landing, features, auth). One gradient accent and a calm
// surface: no glow shadows, no mouse-follow, no animated blobs. Colours come from NEON
// (mode-aware) rather than literals so light mode keeps its contrast.

import type { SxProps, Theme } from "@mui/material";
import { NEON } from "../../theme";

export const neonFor = (theme: Theme) => (theme.palette.mode === "dark" ? NEON.dark : NEON.light);

/** Gradient-clipped headline text. */
export const gradientTextSx = (theme: Theme, stops: "full" | "short" = "full"): SxProps<Theme> => {
  const a = neonFor(theme);
  const gradient =
    stops === "full"
      ? `linear-gradient(135deg, ${a.cyan} 0%, ${a.cyanMid} 30%, ${a.blue} 60%, ${a.magenta} 100%)`
      : `linear-gradient(135deg, ${a.cyan} 0%, ${a.magenta} 100%)`;
  return {
    background: gradient,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  };
};

/** 2px gradient line along the top edge of a surface. The parent needs `position: relative`. */
export const accentTopLineSx = (theme: Theme): SxProps<Theme> => {
  const a = neonFor(theme);
  return {
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 2,
      background: `linear-gradient(90deg, transparent, ${a.cyan}, ${a.magenta}, transparent)`,
    },
  };
};

/** Shared size/shape for hero and call-to-action buttons. */
export const ctaButtonSx = {
  px: 4,
  py: 1.5,
  fontSize: "1rem",
  fontWeight: 600,
  borderRadius: 2,
} satisfies SxProps<Theme>;
