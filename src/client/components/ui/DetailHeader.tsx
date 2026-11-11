import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { ReactNode } from "react";

interface DetailHeaderProps {
  title: ReactNode;
  /** Small content under the title (for example member avatars). */
  subtitle?: ReactNode;
  /** Avatar or icon before the title. */
  leading?: ReactNode;
  /** Buttons at the right edge. */
  actions?: ReactNode;
  /** Sub-navigation (a `<Tabs>`) drawn under the title row. */
  tabs?: ReactNode;
  breadcrumbs?: ReactNode;
  onBack: () => void;
  backLabel?: string;
  /** Draw as a full-width strip with a bottom border (edge-to-edge layouts). */
  bordered?: boolean;
  /** Space below the header when it is not a bordered strip. */
  mb?: number | Record<string, number>;
}

/**
 * Header for a page that sits one level inside a section: a back arrow, the thing's name,
 * its actions and optionally tabs. `PageHeader` is for top-level pages; use this for
 * "inside a book" or "inside a group" pages.
 */
export default function DetailHeader({
  title,
  subtitle,
  leading,
  actions,
  tabs,
  breadcrumbs,
  onBack,
  backLabel = "Back",
  bordered = false,
  mb = { xs: 2, sm: 3 },
}: DetailHeaderProps) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        ...(bordered ? { borderBottom: 1, borderColor: "divider" } : { mb }),
      }}
    >
      {breadcrumbs}
      <Stack
        direction="row"
        alignItems="center"
        spacing={{ xs: 0.5, sm: 1 }}
        sx={bordered ? { px: 2, pt: { xs: 1.5, sm: 0.5 }, pb: 1 } : undefined}
      >
        <Tooltip title={backLabel}>
          <IconButton size="small" onClick={onBack} aria-label={backLabel}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {leading}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {title}
          </Typography>
          {subtitle}
        </Box>
        {actions}
      </Stack>
      {tabs}
    </Box>
  );
}
