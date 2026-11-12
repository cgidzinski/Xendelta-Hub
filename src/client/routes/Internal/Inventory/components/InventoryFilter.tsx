import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { RADIUS } from "../../../../theme";

export type InventoryView = "all" | "redeem" | "redeemed";

interface InventoryFilterProps {
  value: InventoryView;
  onChange: (view: InventoryView) => void;
  counts: Record<InventoryView, number>;
}

const OPTIONS: Array<{ value: InventoryView; label: string }> = [
  { value: "all", label: "All" },
  { value: "redeem", label: "To redeem" },
  { value: "redeemed", label: "Redeemed" },
];

/** A segmented control: one outlined track, the current view lifted inside it, each with its count. */
export default function InventoryFilter({ value, onChange, counts }: InventoryFilterProps) {
  return (
    <Box
      role="group"
      aria-label="Filter items"
      sx={{
        display: "inline-flex",
        gap: 0.25,
        p: 0.5,
        border: 1,
        borderColor: "divider",
        borderRadius: RADIUS.lg,
      }}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <ButtonBase
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.75,
              minHeight: 40,
              borderRadius: RADIUS.md,
              color: selected ? "text.primary" : "text.secondary",
              bgcolor: (t) => (selected ? alpha(t.palette.primary.main, 0.16) : "transparent"),
              "&:hover": { bgcolor: (t) => alpha(t.palette.primary.main, selected ? 0.2 : 0.08) },
            }}
          >
            <Typography component="span" variant="body2" sx={{ fontWeight: selected ? 700 : 400 }}>
              {option.label}
            </Typography>
            <Box
              component="span"
              sx={{
                px: 1,
                borderRadius: RADIUS.pill,
                fontSize: 12,
                lineHeight: "20px",
                fontWeight: 700,
                bgcolor: selected ? "primary.main" : "action.selected",
                color: selected ? "primary.contrastText" : "text.secondary",
              }}
            >
              {counts[option.value]}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
