import { alpha, type Theme } from "@mui/material/styles";

/** The writing area reads as a field: a soft inset with a border, tall enough not to feel cramped. */
export const noteFieldSx = (theme: Theme) =>
  ({
    bgcolor: alpha(theme.palette.text.primary, 0.05),
    border: 1,
    borderColor: "divider",
    borderRadius: 2,
    p: 2,
    minHeight: 240,
    alignItems: "flex-start",
    fontSize: 16,
    lineHeight: 1.6,
    "&:focus-within": { borderColor: "primary.main" },
  }) as const;
