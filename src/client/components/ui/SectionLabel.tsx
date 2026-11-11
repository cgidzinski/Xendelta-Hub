import { Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material";
import { sectionLabelSx } from "./surfaceStyles";

/** Uppercase, de-emphasised label above a group of content. */
export default function SectionLabel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1, ...sx } as SxProps<Theme>}>
      {children}
    </Typography>
  );
}
