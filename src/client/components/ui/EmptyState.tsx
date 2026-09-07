import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material";
import { emptyStateSx, emptyStateIconCircleSx } from "./surfaceStyles";

interface EmptyStateProps {
  /**
   * The icon element only — colour is applied here, so callers pass a bare `<InboxIcon />`
   * rather than repeating `color="disabled"` or `sx={{ fontSize: 32 }}`. Omit it for a
   * compact, icon-less empty state.
   */
  icon?: ReactNode;
  /** ReactNode, not string: several callers compute the heading from a filter. */
  title?: ReactNode;
  description?: ReactNode;
  /** A primary way out of the empty state — usually the button that creates the first one. */
  action?: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * The centred icon/heading/helper column every list falls back to when it has nothing to
 * show. Previously hand-rolled at thirteen call sites from the `emptyStateSx` tokens,
 * which drifted: two heading variants and three different ways of sizing the icon.
 *
 * Deliberately does NOT render its own Card. One caller (RecipeSteps) wraps it in an
 * outlined card and the rest sit directly on the page, so the surface stays the caller's
 * decision.
 */
export default function EmptyState({ icon, title, description, action, sx }: EmptyStateProps) {
  return (
    <Box sx={{ ...emptyStateSx, ...sx }}>
      {/*
        Colour sits on the wrapper, not the icon: MUI icons fill with currentColor, so a
        bare <BrushIcon /> picks this up, while a caller that means something by the colour
        (ReviewModal's green check) still wins by setting its own.
      */}
      {icon && <Box sx={{ ...emptyStateIconCircleSx, color: "text.disabled" }}>{icon}</Box>}
      {title && <Typography variant="subtitle1">{title}</Typography>}
      {description && (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Box>
  );
}
