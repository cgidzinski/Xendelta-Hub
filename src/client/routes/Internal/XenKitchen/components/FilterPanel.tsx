import { useState } from "react";
import {
  Autocomplete, Box, Button, Chip, Drawer, FormControlLabel, MenuItem, Popover, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography, useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import {
  COOK_METHODS, COOK_METHOD_LABELS, EMPTY_FILTERS, type CookMethod, type KitchenFilters, type KitchenSort,
} from "../../../../../shared/xenkitchen/kitchen";
import { useIngredientSuggestions, useKitchenTags } from "../../../../hooks/xenkitchen/useKitchen";
import { MethodIconView } from "./kitchenIcons";

export const SORT_LABELS: Record<KitchenSort, string> = {
  updated: "Recently updated",
  created: "Newest",
  title: "A–Z",
  time: "Quickest",
};

const TIME_OPTIONS = [15, 30, 60];

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  filters: KitchenFilters;
  onChange: (f: KitchenFilters) => void;
}

/** Popover on desktop, bottom sheet on phones; same body either way. */
export default function FilterPanel({ anchor, open, onClose, filters, onChange }: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const body = <FilterBody filters={filters} onChange={onChange} onClose={onClose} />;

  if (phone) {
    return (
      <Drawer anchor="bottom" open={open} onClose={onClose}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85vh" } } }}>
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: "divider", mx: "auto", mt: 1 }} />
        {body}
      </Drawer>
    );
  }
  return (
    <Popover open={open} anchorEl={anchor} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ paper: { sx: { width: 380, mt: 1, borderRadius: 3 } } }}>
      {body}
    </Popover>
  );
}

function FilterBody({ filters, onChange, onClose }: { filters: KitchenFilters; onChange: (f: KitchenFilters) => void; onClose: () => void }) {
  const set = (patch: Partial<KitchenFilters>) => onChange({ ...filters, ...patch });
  const { tags } = useKitchenTags();
  const [ingQuery, setIngQuery] = useState("");
  const { suggestions } = useIngredientSuggestions(ingQuery);

  return (
    <Stack spacing={2.5} sx={{ p: 2.5 }}>
      <Box>
        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Sort</Typography>
        <TextField select size="small" fullWidth value={filters.sort} onChange={(e) => set({ sort: e.target.value as KitchenSort })}>
          {(Object.keys(SORT_LABELS) as KitchenSort[]).map((s) => <MenuItem key={s} value={s}>{SORT_LABELS[s]}</MenuItem>)}
        </TextField>
      </Box>

      <FormControlLabel
        control={<Switch checked={filters.favorite} onChange={(e) => set({ favorite: e.target.checked })} />}
        label="Favorites only"
      />

      <Box>
        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Ready in</Typography>
        <ToggleButtonGroup exclusive size="small" fullWidth value={filters.maxMinutes ?? 0}
          onChange={(_, v) => set({ maxMinutes: v ? Number(v) : null })}>
          <ToggleButton value={0}>Any</ToggleButton>
          {TIME_OPTIONS.map((t) => <ToggleButton key={t} value={t}>≤ {t} min</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      <Autocomplete
        multiple
        size="small"
        options={tags.map((t) => t.tag)}
        value={filters.tags}
        onChange={(_, v) => set({ tags: v })}
        renderInput={(p) => <TextField {...p} label="Tags" placeholder={filters.tags.length ? "" : "Any tag"} />}
        noOptionsText="No tags yet"
      />

      <Autocomplete
        multiple
        freeSolo
        size="small"
        options={suggestions.map((s) => s.name)}
        filterOptions={(x) => x}
        value={filters.ingredients}
        inputValue={ingQuery}
        onInputChange={(_, v) => setIngQuery(v)}
        onChange={(_, v) => set({ ingredients: v as string[] })}
        renderInput={(p) => <TextField {...p} label="Contains ingredient" placeholder={filters.ingredients.length ? "" : "e.g. chicken"} />}
      />

      <Box>
        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Cooking method</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {COOK_METHODS.map((m: CookMethod) => (
            <Chip
              key={m}
              icon={<MethodIconView method={m} sx={{ fontSize: 18 }} />}
              label={COOK_METHOD_LABELS[m]}
              color={filters.method === m ? "primary" : "default"}
              variant={filters.method === m ? "filled" : "outlined"}
              onClick={() => set({ method: filters.method === m ? "" : m })}
            />
          ))}
        </Stack>
      </Box>

      <Stack direction="row" justifyContent="space-between">
        <Button color="inherit" onClick={() => onChange({ ...EMPTY_FILTERS, q: filters.q, category: filters.category, sort: filters.sort })}>
          Clear filters
        </Button>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </Stack>
    </Stack>
  );
}
