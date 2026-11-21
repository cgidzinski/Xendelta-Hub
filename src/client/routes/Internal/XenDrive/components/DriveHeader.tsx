import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

export function DriveHeader({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 2 }}>{children}</Box>;
}

export function DriveHeading({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0 }}>
      {icon}
      <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
    </Box>
  );
}
