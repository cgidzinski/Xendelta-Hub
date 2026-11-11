import { Box, Paper } from "@mui/material";
import type { ReactNode } from "react";

interface BannerProps {
  children: ReactNode;
  /** `bottom` for prompts, `top` for status bars. */
  position?: "top" | "bottom";
  color?: "default" | "primary" | "warning";
}

/** Fixed, full-width strip shared by the PWA install/push/update/offline messages. */
export default function Banner({ children, position = "bottom", color = "default" }: BannerProps) {
  const filled = color !== "default";
  return (
    <Paper
      square
      variant="outlined"
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        [position]: 0,
        zIndex: (t) => t.zIndex.snackbar,
        borderLeft: 0,
        borderRight: 0,
        ...(filled
          ? { bgcolor: `${color}.main`, color: `${color}.contrastText`, borderColor: `${color}.main` }
          : {}),
      }}
    >
      <Box sx={{ maxWidth: 600, mx: "auto", p: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        {children}
      </Box>
    </Paper>
  );
}
