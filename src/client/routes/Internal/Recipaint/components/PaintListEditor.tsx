import { Autocomplete, Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { EMPTY_PAINT, PAINT_TYPES, RecipePaint } from "../../../../../shared/recipaint/paints";
import { usePaintSuggestions } from "../../../../hooks/recipaint/useRecipaint";

interface PaintListEditorProps {
  paints: RecipePaint[];
  onChange: (paints: RecipePaint[]) => void;
}

/** Distinct values across everything the painter has used before, for the autocompletes. */
const distinct = (values: string[]): string[] =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export default function PaintListEditor({ paints, onChange }: PaintListEditorProps) {
  const { paints: suggestions } = usePaintSuggestions();

  const brandOptions = distinct(suggestions.map((p) => p.brand));
  const update = (index: number, patch: Partial<RecipePaint>) => {
    onChange(paints.map((paint, i) => (i === index ? { ...paint, ...patch } : paint)));
  };

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
        Paints
      </Typography>

      <Stack spacing={1}>
        {paints.map((paint, index) => {
          // Once a brand is chosen, only suggest names from that brand's range.
          const nameOptions = distinct(
            suggestions.filter((p) => !paint.brand || p.brand === paint.brand).map((p) => p.name),
          );

          return (
            <Stack
              key={index}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Autocomplete
                freeSolo
                size="small"
                options={brandOptions}
                value={paint.brand}
                onInputChange={(_, value) => update(index, { brand: value })}
                sx={{ flex: 1, minWidth: 0 }}
                renderInput={(params) => <TextField {...params} label="Brand" placeholder="Citadel" />}
              />
              <Autocomplete
                freeSolo
                size="small"
                options={nameOptions}
                value={paint.name}
                onInputChange={(_, value) => {
                  // Picking a known paint carries its recorded swatch and type across.
                  const known = suggestions.find(
                    (p) => p.name === value && (!paint.brand || p.brand === paint.brand),
                  );
                  update(index, {
                    name: value,
                    ...(known && !paint.hex && known.hex ? { hex: known.hex } : {}),
                    ...(known && !paint.type && known.type ? { type: known.type } : {}),
                    ...(known && !paint.brand && known.brand ? { brand: known.brand } : {}),
                  });
                }}
                sx={{ flex: 1.4, minWidth: 0 }}
                renderInput={(params) => <TextField {...params} label="Paint" placeholder="Nuln Oil" />}
              />
              <TextField
                select
                size="small"
                label="Type"
                value={paint.type}
                onChange={(e) => update(index, { type: e.target.value as RecipePaint["type"] })}
                sx={{ width: { xs: "100%", sm: 130 }, flexShrink: 0 }}
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
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                <Box
                  component="input"
                  type="color"
                  aria-label={`Swatch colour for paint ${index + 1}`}
                  title={paint.hex || "No colour picked"}
                  value={paint.hex || "#000000"}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(index, { hex: e.target.value })}
                  sx={{
                    width: 38,
                    height: 38,
                    p: 0,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    background: "none",
                    cursor: "pointer",
                    // A colour input can't render "unset", and its black default reads as a
                    // deliberate black. Dim it until the painter actually picks something.
                    opacity: paint.hex ? 1 : 0.4,
                  }}
                />
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Remove paint ${index + 1}`}
                  onClick={() => onChange(paints.filter((_, i) => i !== index))}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          );
        })}
      </Stack>

      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => onChange([...paints, { ...EMPTY_PAINT }])}
        sx={{ mt: paints.length ? 1 : 0, textTransform: "none" }}
      >
        Add paint
      </Button>
    </Box>
  );
}
