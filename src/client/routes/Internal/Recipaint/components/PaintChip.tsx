import { Box, Chip, Tooltip } from "@mui/material";
import { RecipePaint, formatPaint } from "../../../../../shared/recipaint/paints";

interface PaintChipProps {
  paint: RecipePaint;
  size?: "small" | "medium";
}

/** A paint rendered as its swatch plus "Brand: Name", with the paint type as the tooltip. */
export default function PaintChip({ paint, size = "small" }: PaintChipProps) {
  const label = formatPaint(paint);
  if (!label) return null;

  const swatch = (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        flexShrink: 0,
        ml: 0.75,
        border: "1px solid",
        borderColor: "divider",
        // No colour recorded yet - a hollow ring reads as "unset" rather than as black.
        backgroundColor: paint.hex || "transparent",
      }}
    />
  );

  const chip = (
    <Chip
      size={size}
      variant="outlined"
      icon={swatch}
      label={label}
      sx={{ maxWidth: "100%", "& .MuiChip-label": { textOverflow: "ellipsis" } }}
    />
  );

  return paint.type ? <Tooltip title={paint.type}>{chip}</Tooltip> : chip;
}
