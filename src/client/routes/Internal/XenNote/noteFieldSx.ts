import { alpha, type Theme } from "@mui/material/styles";

export const textNoteMinHeight = 300;

/** The writing area reads as a field: a soft inset with a border, tall enough not to feel cramped. */
export const noteFieldSx = (theme: Theme, editing = false) =>
  ({
    bgcolor: editing ? "background.paper" : alpha(theme.palette.text.primary, 0.05),
    border: 1,
    borderColor: editing ? "text.secondary" : "divider",
    borderRadius: 2,
    p: 2,
    minHeight: 240,
    alignItems: "flex-start",
    fontSize: 16,
    lineHeight: 1.6,
    "&:focus-within": editing
      ? { borderColor: "primary.main", outline: "1px solid", outlineColor: "primary.main" }
      : { borderColor: "primary.main" },
  }) as const;
