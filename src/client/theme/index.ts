import { createTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

export type ThemeMode = "light" | "dark";

/**
 * The one blue the app is built around. Dark surfaces want the brighter shade and light
 * surfaces the deeper one, or the same hue fails contrast on one of the two grounds.
 */
const BRAND = {
  dark: { main: "#2196f3", light: "#42a5f5", dark: "#1976d2" },
  light: { main: "#1565c0", light: "#4285cd", dark: "#0d47a1" },
} as const;

/**
 * NOTE ON RADIUS: `shape.borderRadius` stays at MUI's default of 4. In `sx`,
 * `borderRadius: 2` resolves to 2 * shape.borderRadius, and the app has ~324 such
 * usages (including `cardSx`), so raising shape would silently double every one of
 * them. The 8px card radius therefore lives on the MuiCard default instead, where it
 * applies to plain `<Card>` without touching anything that sets its own.
 */
export function createAppTheme(mode: ThemeMode): Theme {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: isDark ? BRAND.dark : BRAND.light,
      ...(isDark
        ? {}
        : {
            // A faintly cool ground rather than pure white, so outlined cards on top of
            // it still read as raised surfaces.
            background: { default: "#f6f7f9", paper: "#ffffff" },
          }),
    },

    typography: {
      // Headings only. Body sizes stay at MUI's defaults: the app has a lot of dense
      // tabular content that is already tuned against them.
      h4: { fontWeight: 600, letterSpacing: "-0.01em" },
      h5: { fontWeight: 600, letterSpacing: "-0.01em" },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 500 },
      overline: { letterSpacing: "0.08em", fontWeight: 600 },
      button: { textTransform: "none", fontWeight: 500 },
    },

    components: {
      // Cards are flat and outlined everywhere in this app. Making that the default is
      // what lets pages stop repeating the same three lines of sx.
      MuiCard: {
        defaultProps: { variant: "outlined", elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 8,
            borderColor: theme.palette.divider,
            backgroundImage: "none",
          }),
        },
      },
      MuiPaper: {
        // MUI lightens dark-mode Paper by elevation via a background image. The app's
        // surfaces are distinguished by border, not elevation, so it only muddies them.
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 6 } },
      },
      // Deliberately no MuiTextField default. Half the app's 120 fields already opt into
      // size="small" and the other half do not, so defaulting it would resize 60 inputs
      // that were left at the default on purpose. Picking one size is a design decision
      // per form, not a defaults cleanup.
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 10 } },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
      },
    },
  });
}
