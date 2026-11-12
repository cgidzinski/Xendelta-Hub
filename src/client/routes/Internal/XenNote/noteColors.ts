import { alpha, type Theme } from "@mui/material/styles";
import type { NoteColor } from "@shared/xennote/notes";

// Note colours are names stored with the note; each is drawn from a theme colour, so it looks right in
// light and dark and follows the design language (no hex values here).
const PALETTE_KEY: Record<
  Exclude<NoteColor, "default">,
  "error" | "warning" | "success" | "info" | "primary" | "secondary"
> = {
  red: "error",
  orange: "warning",
  green: "success",
  teal: "info",
  blue: "primary",
  purple: "secondary",
};

export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
  default: "Default",
  red: "Red",
  orange: "Orange",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
};

/** The solid colour for a swatch, or null for the default (no tint). */
export function swatchColor(theme: Theme, color: NoteColor): string | null {
  return color === "default" ? null : theme.palette[PALETTE_KEY[color]].main;
}

/** Background and border for a note or notebook card of this colour. */
export function noteSurfaceSx(color: NoteColor) {
  return (theme: Theme) => {
    const main = swatchColor(theme, color);
    if (!main) return { backgroundColor: theme.palette.background.paper, borderColor: theme.palette.divider };
    return {
      backgroundColor: alpha(main, theme.palette.mode === "dark" ? 0.2 : 0.12),
      borderColor: alpha(main, 0.5),
    };
  };
}
