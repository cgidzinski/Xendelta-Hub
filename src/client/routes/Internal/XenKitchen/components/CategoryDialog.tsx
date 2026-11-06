import { useEffect, useState } from "react";
import {
  Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Popover, Stack,
  TextField, Tooltip, Typography, useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { CATEGORY_COLORS, CATEGORY_ICONS, type KitchenLayout } from "../../../../../shared/xenkitchen/kitchen";
import {
  useCreateKitchenCategory, useDeleteKitchenCategory, useKitchenCategories, useReorderKitchenCategories,
  useUpdateKitchenCategory, type KitchenCategory,
} from "../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView } from "./kitchenIcons";

export const LAYOUT_LABELS: Record<KitchenLayout, { label: string; help: string }> = {
  recipe: { label: "Recipe", help: "Servings, times, ingredients and steps" },
  instructions: { label: "Instructions", help: "Brand, oven/microwave/air fryer directions and storage — no ingredients" },
};

export function LayoutSelect({ value, onChange, size = "small" }: { value: KitchenLayout; onChange: (v: KitchenLayout) => void; size?: "small" | "medium" }) {
  return (
    <TextField select size={size} label="Shows" value={value} onChange={(e) => onChange(e.target.value as KitchenLayout)} sx={{ minWidth: 170 }}>
      {(Object.keys(LAYOUT_LABELS) as KitchenLayout[]).map((l) => (
        <MenuItem key={l} value={l}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{LAYOUT_LABELS[l].label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "normal" }}>{LAYOUT_LABELS[l].help}</Typography>
          </Box>
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Icon + colour in one button; opens a picker grid. */
export function AppearancePicker({ icon, color, onChange }: { icon: string; color: string; onChange: (v: { icon?: string; color?: string }) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title="Icon and colour">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ bgcolor: alpha(color, 0.18), "&:hover": { bgcolor: alpha(color, 0.3) } }}>
          <CategoryIconView icon={icon} sx={{ color }} />
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { p: 2, width: 288, borderRadius: 3 } } }}>
        <Typography variant="caption" color="text.secondary">Icon</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0.5, mt: 0.5, mb: 1.5 }}>
          {CATEGORY_ICONS.map((i) => (
            <IconButton key={i} size="small" onClick={() => onChange({ icon: i })}
              sx={{ bgcolor: i === icon ? alpha(color, 0.25) : undefined }}>
              <CategoryIconView icon={i} fontSize="small" sx={{ color: i === icon ? color : undefined }} />
            </IconButton>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">Colour</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, mt: 0.5 }}>
          {CATEGORY_COLORS.map((c) => (
            <Box key={c} role="button" aria-label={c} onClick={() => onChange({ color: c })} sx={{
              width: 32, height: 32, borderRadius: "50%", bgcolor: c, cursor: "pointer",
              outline: c === color ? "3px solid" : "none", outlineColor: "text.primary", outlineOffset: 2,
            }} />
          ))}
        </Box>
      </Popover>
    </>
  );
}

function CategoryRow({ cat, first, last, onMove }: { cat: KitchenCategory; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  const update = useUpdateKitchenCategory();
  const remove = useDeleteKitchenCategory();
  const confirm = useConfirm();
  const [name, setName] = useState(cat.name);
  useEffect(() => setName(cat.name), [cat.name]);

  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ id: cat._id, patch });

  const del = async () => {
    const ok = await confirm({
      title: `Delete "${cat.name}"?`,
      message: cat.count
        ? `Its ${cat.count} item${cat.count > 1 ? "s" : ""} won't be deleted — they'll just be uncategorised.`
        : "It has no items.",
    });
    if (ok) remove.mutate(cat._id);
  };

  return (
    <Card variant="outlined" sx={{ ...cardSx, p: 1.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
          <AppearancePicker icon={cat.icon} color={cat.color} onChange={save} />
          <TextField
            size="small"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { const n = name.trim(); if (n && n !== cat.name) save({ name: n }); else setName(cat.name); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            slotProps={{ htmlInput: { maxLength: 40, "aria-label": "Category name" } }}
            helperText={`${cat.count} item${cat.count === 1 ? "" : "s"}`}
          />
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between">
          <LayoutSelect value={cat.layout} onChange={(layout) => save({ layout })} />
          <Stack direction="row">
            <IconButton size="small" disabled={first} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUpwardIcon fontSize="small" /></IconButton>
            <IconButton size="small" disabled={last} onClick={() => onMove(1)} aria-label="Move down"><ArrowDownwardIcon fontSize="small" /></IconButton>
            <IconButton size="small" onClick={del} aria-label="Delete category"><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

export default function CategoryDialog({ open, onClose, bookId, bookName }: { open: boolean; onClose: () => void; bookId: string; bookName?: string }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const { enqueueSnackbar } = useSnackbar();
  const { categories } = useKitchenCategories(bookId);
  const reorder = useReorderKitchenCategories();
  const create = useCreateKitchenCategory();
  const [order, setOrder] = useState<KitchenCategory[]>(categories);
  useEffect(() => setOrder(categories), [categories]);

  const [newName, setNewName] = useState("");
  const [newLayout, setNewLayout] = useState<KitchenLayout>("recipe");
  const [newLook, setNewLook] = useState({ icon: "restaurant", color: CATEGORY_COLORS[9] });

  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
    reorder.mutate({ book_id: bookId, ids: next.map((c) => c._id) });
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ book_id: bookId, name, layout: newLayout, ...newLook });
      setNewName("");
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message ?? "Couldn't add category", { variant: "error" });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle sx={{ fontWeight: 700 }}>Categories{bookName ? ` · ${bookName}` : ""}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Categories belong to this book and are shared with everyone in it. A category's <b>Shows</b> setting picks which fields its items have: full recipes, or just the cooking directions off a box.
        </Typography>
        <Stack spacing={1}>
          {order.map((c, i) => (
            <CategoryRow key={c._id} cat={c} first={i === 0} last={i === order.length - 1} onMove={(d) => move(i, d)} />
          ))}
        </Stack>

        <Card variant="outlined" sx={{ ...cardSx, p: 1.5, mt: 2, borderStyle: "dashed" }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>New category</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
              <AppearancePicker icon={newLook.icon} color={newLook.color} onChange={(v) => setNewLook((l) => ({ ...l, ...v }))} />
              <TextField size="small" fullWidth placeholder="e.g. Soups" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }} slotProps={{ htmlInput: { maxLength: 40 } }} />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <LayoutSelect value={newLayout} onChange={setNewLayout} />
              <Button variant="contained" startIcon={<AddIcon />} disabled={!newName.trim() || create.isPending} onClick={add}>Add</Button>
            </Stack>
          </Stack>
        </Card>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
