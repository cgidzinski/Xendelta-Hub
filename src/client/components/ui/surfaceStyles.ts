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
export const emptyStateSx: SxProps<Theme> = {
  textAlign: "center",
  py: 8,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 1.5,
};

// The 64x64 tinted circle that wraps the empty-state icon.
export const emptyStateIconCircleSx: SxProps<Theme> = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  bgcolor: "action.hover",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  mb: 0.5,
};
