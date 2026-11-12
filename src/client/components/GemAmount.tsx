import { Box, Typography } from "@mui/material";
import type { TypographyProps } from "@mui/material";
import { GemIcon } from "./icons/GemIcon";
import { GEM_COLOR } from "../theme";

interface GemAmountProps {
  amount: number;
  /** Icon size in px; the text follows the variant. */
  iconSize?: number;
  variant?: TypographyProps["variant"];
  color?: TypographyProps["color"];
}

/** A number of gems: the gem icon and the amount, the same everywhere a price or balance is shown. */
export default function GemAmount({ amount, iconSize = 18, variant = "subtitle2", color }: GemAmountProps) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
      <GemIcon sx={{ fontSize: iconSize, color: GEM_COLOR }} />
      <Typography component="span" variant={variant} color={color} sx={{ fontWeight: 700 }}>
        {amount.toLocaleString()}
      </Typography>
    </Box>
  );
}
