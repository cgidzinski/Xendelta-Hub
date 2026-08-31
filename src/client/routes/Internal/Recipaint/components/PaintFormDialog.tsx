import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { PAINT_TYPES } from "../../../../../shared/recipaint/paints";
import { CollectionPaint, PaintDraft, usePaintMutations, usePaints } from "../../../../hooks/recipaint/usePaints";

interface PaintFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing paint; omit to add a new one. */
  paint?: CollectionPaint | null;
  /** Called after a successful save, with the saved paint. */
  onSaved?: (paint: CollectionPaint) => void;
  /** Prefill the name, e.g. from what was typed into the recipe's paint picker. */
  initialName?: string;
}

const EMPTY_DRAFT: PaintDraft = { brand: "", name: "", hex: "", type: "", quantity: 1 };

export default function PaintFormDialog({ open, onClose, paint, onSaved, initialName }: PaintFormDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { paints } = usePaints();
  const { createPaint, isCreating, updatePaint, isUpdating } = usePaintMutations();
  const [draft, setDraft] = useState<PaintDraft>(EMPTY_DRAFT);

  const isEditing = Boolean(paint);
  const isSaving = isCreating || isUpdating;

  // Brands the user already owns, so a range is typed once and picked thereafter.
  const brandOptions = [...new Set(paints.map((p) => p.brand.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(
      paint
        ? { brand: paint.brand, name: paint.name, hex: paint.hex, type: paint.type, quantity: paint.quantity }
        : { ...EMPTY_DRAFT, name: initialName || "" },
    );
  }, [open, paint, initialName]);

  const set = (patch: Partial<PaintDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = async (addAnother: boolean) => {
    try {
      const saved = paint
        ? await updatePaint({ id: paint._id, data: draft })
        : await createPaint(draft);
      onSaved?.(saved);

      if (addAnother) {
        // Keep brand and type: paints are added a range at a time, and retyping "Citadel"
        // for every pot is the whole friction this button exists to remove.
        setDraft((prev) => ({ ...EMPTY_DRAFT, brand: prev.brand, type: prev.type }));
        return;
      }
      onClose();
    } catch (error: any) {
      // The server answers a duplicate with a 409 and a readable message; surface that
      // rather than a generic failure.
      const message = error?.response?.data?.message || error?.message || "Failed to save paint";
      enqueueSnackbar(message, { variant: "error" });
    }
  };

  const canSave = Boolean(draft.name.trim()) && !isSaving;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEditing ? "Edit paint" : "Add paint"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Autocomplete
            freeSolo
            size="small"
            options={brandOptions}
            value={draft.brand}
            onInputChange={(_, value) => set({ brand: value })}
            renderInput={(params) => <TextField {...params} label="Brand" placeholder="Citadel" />}
          />
          <TextField
            autoFocus
            size="small"
            label="Name"
            required
            placeholder="Nuln Oil"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) save(false);
            }}
          />
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              select
              size="small"
              label="Type"
              value={draft.type}
              onChange={(e) => set({ type: e.target.value as PaintDraft["type"] })}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">
                <em>Unspecified</em>
              </MenuItem>
              {PAINT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              label="Owned"
              value={draft.quantity}
              onChange={(e) => set({ quantity: Math.max(0, Number(e.target.value) || 0) })}
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
              sx={{ width: 96 }}
            />
            <Box
              component="input"
              type="color"
              aria-label="Swatch colour"
              title={draft.hex || "No colour picked"}
              value={draft.hex || "#000000"}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ hex: e.target.value })}
              sx={{
                width: 40,
                height: 40,
                p: 0,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                background: "none",
                cursor: "pointer",
                // A colour input cannot render "unset", and its black default reads as a
                // deliberate black. Dim it until a colour is actually picked.
                opacity: draft.hex ? 1 : 0.4,
                flexShrink: 0,
              }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {!isEditing && (
          <Button onClick={() => save(true)} disabled={!canSave}>
            Save &amp; add another
          </Button>
        )}
        <Button variant="contained" onClick={() => save(false)} disabled={!canSave}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
