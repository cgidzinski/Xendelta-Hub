// Shared "app shell" surface styling, distilled from the Xensplit design language.
// Use these across the app shell (Profile, Notifications, Home, nav) to keep the
// flat-outlined-card look consistent. Theme-token based so it tracks the palette.

import type { SxProps, Theme } from "@mui/material";

// Flat outlined card: subtle 1px divider border, no drop shadow, 8px radius.
// Pair with <Card variant="outlined" sx={cardSx}> or any <Box>.
// Declared `satisfies` (not annotated) so the concrete object type survives and the
// tokens can be spread into other sx objects.
export const cardSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2,
} satisfies SxProps<Theme>;

// Uppercase, de-emphasized section label.
export const sectionLabelSx = {
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  display: "block",
  color: "text.disabled",
} satisfies SxProps<Theme>;

// Centered empty-state column (icon-in-a-circle + heading + helper text).
// `satisfies` rather than an `: SxProps<Theme>` annotation, like cardSx above, so the
// concrete object type survives and EmptyState.tsx can spread this into its own sx.
export const emptyStateSx = {
  textAlign: "center",
  py: 8,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 1.5,
} satisfies SxProps<Theme>;

// The 64x64 tinted circle that wraps the empty-state icon.
export const emptyStateIconCircleSx = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  bgcolor: "action.hover",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  mb: 0.5,
} satisfies SxProps<Theme>;

// Icon button that sits on top of an image (remove/edit/zoom). `dark` for light imagery,
// `light` for dark imagery. Replaces ~10 hand-written copies.
export const overlayButtonSx = {
  dark: {
    bgcolor: "rgba(0,0,0,0.55)",
    color: "common.white",
    "&:hover": { bgcolor: "rgba(0,0,0,0.75)" },
  },
  light: {
    bgcolor: "rgba(255,255,255,0.8)",
    color: "common.black",
    "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
  },
} satisfies Record<string, SxProps<Theme>>;

// Page title role: h5 with h1 semantics. Use via <PageHeader>.
export const pageTitleSx = {
  fontWeight: 700,
  letterSpacing: "-0.02em",
} satisfies SxProps<Theme>;
