import { createTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

export type ThemeMode = "light" | "dark";

/*
 * Design language reference: src/client/components/ui/DESIGN.md
 * Tokens live here and in components/ui/surfaceStyles.ts; shared building blocks live in
 * components/ui/. Use theme tokens rather than hex/rgba literals in pages.
 */

/**
 * Radius scale in `sx` units (multiples of shape.borderRadius = 4px): 4 / 6 / 8 / 10px
 * plus a pill. Pages should pick from this rather than inventing values.
 */
export const RADIUS = { sm: 1, md: 1.5, lg: 2, xl: 2.5, pill: 999 } as const;

/** Page widths. `lg` is the default; `md` suits single-column forms, settings and detail pages. */
export const PAGE_MAX_WIDTH = { default: "lg", narrow: "md", wide: "xl" } as const;

/** Gold used for the points currency icon. */
export const POINTS_GOLD = "#FFD700";

/**
 * The one blue the app is built around. Dark surfaces want the brighter shade and light
 * surfaces the deeper one, or the same hue fails contrast on one of the two grounds.
 */
const BRAND = {
  dark: { main: "#2196f3", light: "#42a5f5", dark: "#1976d2" },
  light: { main: "#1565c0", light: "#4285cd", dark: "#0d47a1" },
} as const;

/**
 * The External marketing/auth pages' "neon" gradient-text accent. Same problem as BRAND
 * above, worse: the bright cyan/magenta stops that glow against a near-black ground clip
 * to text at 1.3-2.6:1 contrast on white (need 4.5:1), so light mode swaps in the deeper
 * step of each hue instead.
 */
export const NEON = {
  dark: { cyan: "#00f5ff", cyanMid: "#00d4ff", blue: "#00a8ff", magenta: "#ff00ff" },
  light: { cyan: "#0e7490", cyanMid: "#0369a1", blue: "#075985", magenta: "#a21caf" },
} as const;

/** The brand blue gradient (wordmarks, hero accents), following the active palette. */
export function brandGradient(theme: Theme): string {
  return `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.dark} 100%)`;
}

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
      // Magenta family from NEON, used by the public pages' accent. Defined so
      // `secondary.main` stops falling back to MUI's default purple.
      secondary: isDark
        ? { main: NEON.dark.magenta, light: "#ff66ff", dark: "#cc00cc" }
        : { main: NEON.light.magenta, light: "#c026d3", dark: "#86198f" },
      ...(isDark
        ? {}
        : {
            // A faintly cool ground rather than pure white, so outlined cards on top of
            // it still read as raised surfaces.
            background: { default: "#f6f7f9", paper: "#ffffff" },
            // MUI's default warning orange (#ed6c02) read as too bright/traffic-cone on
            // white; this amber clears 5:1 contrast instead of the default's ~3.9:1.
            warning: { main: "#b45309" },
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
      // Dialogs: 10px corners, square when full screen on mobile. Width stays per dialog.
      MuiDialog: {
        styleOverrides: {
          paper: ({ ownerState }) => ({
            borderRadius: ownerState.fullScreen ? 0 : 10,
          }),
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 6 } },
      },
      // Deliberately no MuiTextField default. Half the app's 120 fields already opt into
      // size="small" and the other half do not, so defaulting it would resize 60 inputs
      // that were left at the default on purpose. Picking one size is a design decision
      // per form, not a defaults cleanup.
      MuiTooltip: {
        defaultProps: { arrow: true },
      },
    },
  });
}
