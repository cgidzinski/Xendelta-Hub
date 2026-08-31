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
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { PAINT_TYPES } from "../../../../../shared/recipaint/paints";
import { CollectionPaint, PaintDraft, usePaintMutations, usePaints } from "../../../../hooks/recipaint/usePaints";
import { CataloguePaint, usePaintCatalogueSearch } from "../../../../hooks/recipaint/usePaintCatalogue";

interface PaintFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing paint; omit to add a new one. */
  paint?: CollectionPaint | null;
  /** Called after a successful save, with the saved paint. */
  onSaved?: (paint: CollectionPaint) => void;
  /** Prefill the name, e.g. from what was typed into the recipe's paint picker. */
  initialName?: string;
  /** Which tab to open on. The recipe picker opens "custom": it only offers to create a paint
   *  once the catalogue search has already come up empty, so the catalogue tab is a dead end. */
  defaultTab?: "catalogue" | "custom";
}

const EMPTY_DRAFT: PaintDraft = { brand: "", name: "", range: "", hex: "", type: "", quantity: 1, catalogueKey: "" };

const fromCatalogue = (entry: CataloguePaint, quantity: number): PaintDraft => ({
  brand: entry.brand,
  name: entry.name,
  range: entry.range,
  hex: entry.hex,
  type: entry.type,
  quantity,
  catalogueKey: entry.key,
});

export default function PaintFormDialog({
  open,
  onClose,
  paint,
  onSaved,
  initialName,
  defaultTab = "catalogue",
}: PaintFormDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { paints } = usePaints();
  const { createPaint, isCreating, updatePaint, isUpdating } = usePaintMutations();

  const [draft, setDraft] = useState<PaintDraft>(EMPTY_DRAFT);
  const [tab, setTab] = useState<"catalogue" | "custom">("catalogue");
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [selected, setSelected] = useState<CataloguePaint | null>(null);

  const isEditing = Boolean(paint);
  const isSaving = isCreating || isUpdating;
  // Only query while the catalogue tab is actually on screen.
  const { paints: results, isSearching } = usePaintCatalogueSearch(catalogueQuery, "", open && tab === "catalogue");

  // Brands the user already owns, so a custom range is typed once and picked thereafter.
  const brandOptions = [...new Set(paints.map((p) => p.brand.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(
      paint
        ? {
            brand: paint.brand,
            name: paint.name,
            range: paint.range,
            hex: paint.hex,
            type: paint.type,
            quantity: paint.quantity,
            catalogueKey: paint.catalogueKey,
          }
        : { ...EMPTY_DRAFT, name: initialName || "" },
    );
    setSelected(null);
    setCatalogueQuery(initialName || "");
    // Editing is always the manual form: the paint already exists, and its identity should not
    // silently change because a catalogue row happened to match.
    setTab(paint ? "custom" : defaultTab);
  }, [open, paint, initialName, defaultTab]);

  const set = (patch: Partial<PaintDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = async (addAnother: boolean) => {
    const payload = tab === "catalogue" && selected ? fromCatalogue(selected, draft.quantity) : draft;

    try {
      const saved = paint ? await updatePaint({ id: paint._id, data: payload }) : await createPaint(payload);
      onSaved?.(saved);

      if (addAnother) {
        // Keep brand and type: paints are added a range at a time, and retyping "Citadel" for
        // every pot is the friction this button exists to remove.
        setDraft((prev) => ({ ...EMPTY_DRAFT, brand: prev.brand, type: prev.type }));
        setSelected(null);
        setCatalogueQuery("");
        return;
      }
      onClose();
    } catch (error: any) {
      // The server answers a duplicate with a 409 and a readable message; surface that rather
      // than a generic failure.
      const message = error?.response?.data?.message || error?.message || "Failed to save paint";
      enqueueSnackbar(message, { variant: "error" });
    }
  };

  const canSave = (tab === "catalogue" && !isEditing ? Boolean(selected) : Boolean(draft.name.trim())) && !isSaving;

  const quantityField = (
    <TextField
      size="small"
      type="number"
      label="Owned"
      value={draft.quantity}
      onChange={(e) => set({ quantity: Math.max(0, Number(e.target.value) || 0) })}
      slotProps={{ htmlInput: { min: 0, step: 1 } }}
      sx={{ width: 96 }}
    />
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: isEditing ? undefined : 0 }}>{isEditing ? "Edit paint" : "Add paint"}</DialogTitle>

      {!isEditing && (
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 3, minHeight: 40 }}>
          <Tab value="catalogue" label="From catalogue" sx={{ minHeight: 40, textTransform: "none" }} />
          <Tab value="custom" label="Custom" sx={{ minHeight: 40, textTransform: "none" }} />
        </Tabs>
      )}

      <DialogContent>
        {!isEditing && tab === "catalogue" ? (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Autocomplete
              autoFocus
              size="small"
              options={results}
              loading={isSearching}
              value={selected}
              filterOptions={(options) => options} // already filtered server-side
              isOptionEqualToValue={(option, value) => option.key === value.key}
              // The range belongs in the label: two ranges share a name, and without it the
              // selected value is ambiguous and MUI derives colliding React keys from it.
              getOptionLabel={(option) =>
                option.range ? `${option.brand}: ${option.name} (${option.range})` : `${option.brand}: ${option.name}`
              }
              onInputChange={(_, value) => setCatalogueQuery(value)}
              onChange={(_, value) => setSelected(value)}
              renderOption={(props, option) => {
                const { key: _labelKey, ...optionProps } = props as typeof props & { key: string };
                return (
                  // option.key, not MUI's label-derived key: the catalogue key includes the
                  // range, so the two "Warlock Purple" rows stay distinct.
                  <Box component="li" key={option.key} {...optionProps} sx={{ display: "flex", gap: 1 }}>
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        flexShrink: 0,
                        border: "1px solid",
                        borderColor: "divider",
                        backgroundColor: option.hex || "transparent",
                      }}
                    />
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="body2" noWrap>
                        {option.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {option.brand}
                        {option.range ? ` - ${option.range}` : ""}
                      </Typography>
                    </Box>
                  </Box>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label="Search paints" placeholder="Type a few letters..." />
              )}
              noOptionsText={catalogueQuery ? "No matching paints" : "Start typing to search"}
            />
            <Stack direction="row" spacing={2} alignItems="center">
              {quantityField}
              {selected && (
                <Typography variant="caption" color="text.secondary">
                  {selected.range || "No range"}
                  {selected.type ? ` - ${selected.type}` : ""}
                </Typography>
              )}
            </Stack>
          </Stack>
        ) : (
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
            <TextField
              size="small"
              label="Range"
              placeholder="Warpaints Air"
              helperText="Optional. Two pots can share a name across ranges."
              value={draft.range}
              onChange={(e) => set({ range: e.target.value })}
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
              {quantityField}
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
        )}
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
