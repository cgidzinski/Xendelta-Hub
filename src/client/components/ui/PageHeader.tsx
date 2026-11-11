import { Box, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { ReactNode } from "react";
import { pageTitleSx } from "./surfaceStyles";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons aligned to the right of the title. */
  actions?: ReactNode;
  /** Shows a back arrow and calls this when pressed. */
  onBack?: () => void;
  mb?: number;
}

/** Title, optional subtitle and actions. The one page header used across the app. */
export default function PageHeader({ title, subtitle, actions, onBack, mb = 2.5 }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        flexWrap: "wrap",
        mb,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        {onBack && (
          <IconButton onClick={onBack} aria-label="Back" edge="start">
            <ArrowBackIcon />
          </IconButton>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={pageTitleSx} noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {actions && <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>{actions}</Box>}
    </Box>
  );
}
