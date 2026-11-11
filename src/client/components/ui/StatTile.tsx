import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { cardSx, sectionLabelSx } from "./surfaceStyles";

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
}

/** Outlined big-number tile: label, value and optional caption. */
export default function StatTile({ label, value, caption }: StatTileProps) {
  return (
    <Box sx={{ ...cardSx, p: 1.75 }}>
      <Typography variant="caption" sx={sectionLabelSx}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: "-0.02em", mt: 0.5 }}>
        {value}
      </Typography>
      {caption && (
        <Typography variant="caption" color="text.secondary">
          {caption}
        </Typography>
      )}
    </Box>
  );
}
