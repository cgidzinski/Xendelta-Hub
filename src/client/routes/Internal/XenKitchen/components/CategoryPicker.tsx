import {
  Box,
  Button,
  Chip,
  Divider,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { RADIUS } from "../../../../theme";
import type { CategoryOption } from "./categoryOptions";

const MANAGE = "__manage__";
const SKELETON_WIDTHS = [72, 112, 96, 124, 88, 108];

interface CategoryPickerProps {
  options: CategoryOption[];
  /** The selected option's id ("" is All). */
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  /** Shows Manage (people who can edit the book). */
  onManage?: () => void;
}

/** The category's colour as a small dot; All and Uncategorised have none, so they get a neutral one. */
function Dot({ color }: { color?: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ width: 10, height: 10, borderRadius: "50%", flex: "none", bgcolor: color ?? "text.disabled" }}
    />
  );
}

/**
 * Picks one category of the book. Chips that wrap on a computer; on a phone one select, so nothing slides sideways
 * and any number of categories is one tap away. Picking the selected chip again goes back to All.
 */
export default function CategoryPicker({ options, value, onChange, loading, onManage }: CategoryPickerProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const selected = options.find((o) => o.id === value) ?? options[0];

  if (loading) {
    // The same height as the real thing, so nothing jumps when it loads.
    return phone ? (
      <Skeleton variant="rounded" height={48} sx={{ borderRadius: 1.5 }} />
    ) : (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {SKELETON_WIDTHS.map((w, i) => (
          <Skeleton key={i} variant="rounded" width={w} height={36} sx={{ borderRadius: RADIUS.pill }} />
        ))}
      </Box>
    );
  }

  if (phone) {
    return (
      <TextField
        select
        fullWidth
        label="Category"
        value={selected?.id ?? ""}
        onChange={(e) => (e.target.value === MANAGE ? onManage?.() : onChange(e.target.value))}
        slotProps={{
          inputLabel: { shrink: true },
          select: {
            displayEmpty: true,
            renderValue: () =>
              selected ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Dot color={selected.color} />
                  <Typography component="span" sx={{ flex: 1, fontWeight: 500 }} noWrap>
                    {selected.label}
                  </Typography>
                  <Typography component="span" variant="body2" color="text.secondary">
                    {selected.count}
                  </Typography>
                </Box>
              ) : null,
          },
          htmlInput: { sx: { minHeight: 24 } },
        }}
        sx={{ "& .MuiSelect-select": { display: "flex", alignItems: "center", minHeight: 24, py: 1.25 } }}
      >
        {options.map((o) => (
          <MenuItem key={o.id || "all"} value={o.id} sx={{ minHeight: 48, gap: 1.5 }}>
            <Dot color={o.color} />
            <ListItemText
              primary={o.label}
              slotProps={{ primary: { noWrap: true, sx: { fontWeight: o.id === value ? 700 : 400 } } }}
            />
            <Typography variant="body2" color="text.secondary">
              {o.count}
            </Typography>
            <ListItemIcon sx={{ minWidth: 0, ml: 1, visibility: o.id === value ? "visible" : "hidden" }}>
              <CheckIcon fontSize="small" color="primary" />
            </ListItemIcon>
          </MenuItem>
        ))}
        {onManage && <Divider key="d" />}
        {onManage && (
          <MenuItem
            key="manage"
            value={MANAGE}
            sx={{ minHeight: 48, gap: 1.5, color: "primary.main", fontWeight: 500 }}
          >
            <EditOutlinedIcon fontSize="small" />
            Manage categories
          </MenuItem>
        )}
      </TextField>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
      <Box role="group" aria-label="Category" sx={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 1 }}>
        {options.map((o) => {
          const active = o.id === value;
          return (
            <Chip
              key={o.id || "all"}
              clickable
              title={o.label}
              aria-pressed={active}
              onClick={() => onChange(active && o.id ? "" : o.id)}
              label={
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                  <Dot color={o.color} />
                  <Box component="span" sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {o.label}
                  </Box>
                  <Box component="span" sx={{ fontWeight: 400, color: active ? "inherit" : "text.secondary" }}>
                    {o.count}
                  </Box>
                </Box>
              }
              sx={{
                height: 36,
                borderRadius: RADIUS.pill,
                px: 0.5,
                fontWeight: 500,
                border: 1,
                borderColor: active ? "primary.main" : "divider",
                bgcolor: active ? alpha(theme.palette.primary.main, 0.12) : "transparent",
                color: active ? "primary.main" : "text.primary",
                "&:hover": { bgcolor: alpha(theme.palette.primary.main, active ? 0.18 : 0.06) },
              }}
            />
          );
        })}
      </Box>
      {onManage && (
        <Button size="small" startIcon={<EditOutlinedIcon />} onClick={onManage} sx={{ flexShrink: 0, height: 36 }}>
          Manage
        </Button>
      )}
    </Box>
  );
}
