import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterList";
import SearchIcon from "@mui/icons-material/Search";
import { useSnackbar } from "notistack";
import { PAINT_TYPES, formatPaint } from "../../../../../shared/recipaint/paints";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { CollectionPaint, PaintDraft, usePaintMutations, usePaints } from "../../../../hooks/recipaint/usePaints";
import {
  CataloguePaint,
  usePaintCatalogueBrands,
  usePaintCatalogueSearch,
} from "../../../../hooks/recipaint/usePaintCatalogue";

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
  /** Close once a paint is added instead of staying open for the next one. The recipe picker
   *  sets this: it is creating one paint to drop into a step, not stocking a shelf. */
  closeAfterSave?: boolean;
}

// Quantity starts at 0, not 1. Adding a paint is as often "I want this" as "I have this" -
// building a shopping list is a first-class use - and the paints page filters owned vs not
// owned off this number.
const EMPTY_DRAFT: PaintDraft = { brand: "", name: "", range: "", hex: "", type: "", quantity: 0, catalogueKey: "" };

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
  closeAfterSave = false,
}: PaintFormDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { paints } = usePaints();
  const { createPaint, isCreating, updatePaint, isUpdating } = usePaintMutations();

  const [draft, setDraft] = useState<PaintDraft>(EMPTY_DRAFT);
  const [tab, setTab] = useState<"catalogue" | "custom">("catalogue");
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [selected, setSelected] = useState<CataloguePaint | null>(null);
  const [brandFilter, setBrandFilter] = useState("");
  const [rangeFilter, setRangeFilter] = useState("");

  const isEditing = Boolean(paint);
  const isSaving = isCreating || isUpdating;
  // Only query while the catalogue tab is actually on screen.
  const onCatalogueTab = open && tab === "catalogue" && !isEditing;
  const { paints: results, isSearching } = usePaintCatalogueSearch(
    catalogueQuery,
    brandFilter,
    rangeFilter,
    onCatalogueTab,
  );
  const { brands: catalogueBrands } = usePaintCatalogueBrands(onCatalogueTab);
  const rangeOptions = catalogueBrands.find((b) => b.name === brandFilter)?.ranges || [];
  // Restates the active filter on the picker, so a short result list never looks like a bug -
  // it is the filter, and it says so.
  const activeFilterLabel = brandFilter
    ? `Showing ${brandFilter}${rangeFilter ? ` - ${rangeFilter}` : ""}`
    : " ";

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
    setBrandFilter("");
    setRangeFilter("");
    // Editing is always the manual form: the paint already exists, and its identity should not
    // silently change because a catalogue row happened to match.
    setTab(paint ? "custom" : defaultTab);
  }, [open, paint, initialName, defaultTab]);

  const set = (patch: Partial<PaintDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    const payload = tab === "catalogue" && selected ? fromCatalogue(selected, draft.quantity) : draft;

    try {
      const saved = paint ? await updatePaint({ id: paint._id, data: payload }) : await createPaint(payload);
      onSaved?.(saved);

      if (isEditing || closeAfterSave) {
        onClose();
        return;
      }

      // Adding stays open, ready for the next pot - stocking a shelf is a repetitive job, and
      // reopening the dialog for each paint was the friction the old second button papered
      // over. Brand and type carry across, since paints are added a range at a time.
      // The snackbar matters here: with the dialog still open and the fields cleared, nothing
      // else on screen confirms the paint landed.
      enqueueSnackbar(`Added ${formatPaint(saved) || saved.name}`, { variant: "success" });
      setDraft((prev) => ({ ...EMPTY_DRAFT, brand: prev.brand, type: prev.type }));
      setSelected(null);
      setCatalogueQuery("");
    } catch (error: any) {
      // The server answers a duplicate with a 409 and a readable message; surface that rather
      // than a generic failure.
      const message = error?.response?.data?.message || error?.message || "Failed to save paint";
      enqueueSnackbar(message, { variant: "error" });
    }
  };

  const canSave = (tab === "catalogue" && !isEditing ? Boolean(selected) : Boolean(draft.name.trim())) && !isSaving;

  // The count with a +1 beside it. Quantity starts at 0, so the common gesture is "I have one
  // of these" - a tap, rather than selecting the field and typing.
  const quantityField = (
    // alignItems stretch rather than a hard-coded height: the button then tracks whatever
    // the text field measures.
    <Stack direction="row" spacing={1} alignItems="stretch">
      <TextField
        size="small"
        type="number"
        label="Owned"
        value={draft.quantity}
        onChange={(e) => set({ quantity: Math.max(0, Number(e.target.value) || 0) })}
        slotProps={{ htmlInput: { min: 0, step: 1 } }}
        sx={{ width: 96 }}
      />
      <Button
        size="small"
        variant="outlined"
        aria-label="Add one to the owned count"
        onClick={() => set({ quantity: draft.quantity + 1 })}
        sx={{ minWidth: 48, flexShrink: 0, alignSelf: "stretch" }}
      >
        +1
      </Button>
    </Stack>
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
            {/* Filters first, then the picker - you narrow, then you choose. The picker is the
                only full-size control, so it is obvious at a glance which one selects a paint
                and which two act on the list it offers. */}
            {/* Tinted and labelled so these read as controls acting on the picker below, rather
                than as two more things to pick from. */}
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "action.hover" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <FilterListIcon fontSize="small" sx={{ color: "text.disabled" }} />
                <Typography variant="caption" sx={{ ...sectionLabelSx, flexGrow: 1 }}>
                  Narrow the catalogue
                </Typography>
                {(brandFilter || rangeFilter) && (
                  <Button
                    size="small"
                    onClick={() => {
                      setBrandFilter("");
                      setRangeFilter("");
                    }}
                    sx={{ textTransform: "none", minWidth: 0, py: 0 }}
                  >
                    Clear
                  </Button>
                )}
              </Stack>
              <Stack direction="row" spacing={1}>

              <TextField
                select
                size="small"
                label="Brand"
                value={brandFilter}
                onChange={(e) => {
                  setBrandFilter(e.target.value);
                  // Ranges belong to a brand, so a stale one would silently match nothing.
                  setRangeFilter("");
                }}
                sx={{ flex: 1, minWidth: 0 }}
              >
                <MenuItem value="">
                  <em>Any brand</em>
                </MenuItem>
                {catalogueBrands.map((brand) => (
                  <MenuItem key={brand.name} value={brand.name}>
                    {brand.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Range"
                value={rangeFilter}
                disabled={!brandFilter}
                onChange={(e) => setRangeFilter(e.target.value)}
                sx={{ flex: 1, minWidth: 0 }}
              >
                <MenuItem value="">
                  <em>Any range</em>
                </MenuItem>
                {rangeOptions.map((range) => (
                  <MenuItem key={range} value={range}>
                    {range}
                  </MenuItem>
                ))}
              </TextField>
              </Stack>
            </Box>
            <Autocomplete
              size="medium"
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
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {option.brand}
                        {option.range ? ` - ${option.range}` : ""}
                      </Typography>
                    </Box>
                  </Box>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  autoFocus
                  label="Pick a paint"
                  placeholder="Type a few letters..."
                  helperText={activeFilterLabel}
                  slotProps={{
                    input: {
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    },
                  }}
                />
              )}
              noOptionsText={catalogueQuery || brandFilter ? "No matching paints" : "Start typing, or filter below"}
            />

            <Stack direction="row" spacing={2} alignItems="center">
              {quantityField}
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
                if (e.key === "Enter" && canSave) save();
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
                sx={{ flex: 1, minWidth: 0 }}
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
            {quantityField}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{isEditing || closeAfterSave ? "Cancel" : "Done"}</Button>
        <Button variant="contained" onClick={save} disabled={!canSave}>
          {isSaving ? "Saving..." : isEditing ? "Save" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
