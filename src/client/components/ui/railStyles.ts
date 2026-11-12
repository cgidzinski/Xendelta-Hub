import { alpha, type Theme } from "@mui/material/styles";

// The left rail shared by the sub-apps that browse in a sidebar (XenDrive, XenNote): one look, so they
// cannot drift apart. Spread these into the rail's own `sx`.

/** The rail column: 256px, a divider on its right, sticky under the app bar. Callers add their own `display`. */
export const railPanelSx = {
  display: "flex",
  flexDirection: "column",
  gap: 0.75,
  flex: "0 0 256px",
  p: 2,
  borderRight: 1,
  borderColor: "divider",
  position: "sticky",
  top: 0,
  alignSelf: "flex-start",
  minHeight: "calc(100vh - 64px)",
} as const;

/** The big "New" button at the top of the rail. */
export const railNewButtonSx = { borderRadius: 6, height: 48, mb: 1.5 } as const;

/** One row of the rail. Active is a router `.active` link or a MUI `.Mui-selected` button. */
export const railItemSx = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  height: 44,
  flexGrow: 0,
  flexShrink: 0,
  px: 1.75,
  borderRadius: 2,
  color: "text.secondary",
  textDecoration: "none",
  fontSize: 14,
  "&:hover": { bgcolor: "action.hover" },
  "&.active, &.Mui-selected, &.Mui-selected:hover": {
    fontWeight: 500,
    color: "primary.main",
    bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.14),
  },
} as const;
