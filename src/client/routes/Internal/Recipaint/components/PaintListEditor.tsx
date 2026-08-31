import { useMemo, useState } from "react";
import { Autocomplete, Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { RecipePaint, formatPaint, paintKey } from "../../../../../shared/recipaint/paints";
import { CollectionPaint, usePaints } from "../../../../hooks/recipaint/usePaints";
import PaintFormDialog from "./PaintFormDialog";

interface PaintListEditorProps {
  paints: RecipePaint[];
  onChange: (paints: RecipePaint[]) => void;
}

/** A step stores a snapshot, not a reference - that is what keeps a shared recipe readable. */
const toStepPaint = (paint: CollectionPaint): RecipePaint => ({
  brand: paint.brand,
  name: paint.name,
  hex: paint.hex,
  type: paint.type,
});

export default function PaintListEditor({ paints, onChange }: PaintListEditorProps) {
  const { paints: collection, isLoading } = usePaints();
  const [dialogOpenFor, setDialogOpenFor] = useState<number | null>(null);

  // A step paint is "known" when the collection holds the same brand+name. Matching by key
  // rather than by id is what lets a cloned recipe light up against your own shelf.
  const collectionByKey = useMemo(() => {
    const map = new Map<string, CollectionPaint>();
    for (const paint of collection) {
      map.set(paintKey({ brand: paint.brand, name: paint.name, hex: "", type: "" }), paint);
    }
    return map;
  }, [collection]);

  const replaceAt = (index: number, paint: RecipePaint) => {
    onChange(paints.map((existing, i) => (i === index ? paint : existing)));
  };

  const removeAt = (index: number) => onChange(paints.filter((_, i) => i !== index));

  const addRow = () => onChange([...paints, { brand: "", name: "", hex: "", type: "" }]);

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
        Paints
      </Typography>

      <Stack spacing={1}>
        {paints.map((paint, index) => {
          const key = paintKey(paint);
          const owned = collectionByKey.get(key);
          const isEmptyRow = !paint.name.trim() && !paint.brand.trim();
          // A paint from a cloned or older recipe that isn't on your shelf: shown as it was
          // saved, but not editable here - the collection is the place to manage paints.
          const isUnknown = !isEmptyRow && !owned;

          return (
            <Stack key={index} direction="row" spacing={1} alignItems="center">
              {isUnknown ? (
                <Box
                  sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    py: 0.75,
                    px: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: "1px solid",
                      borderColor: "divider",
                      backgroundColor: paint.hex || "transparent",
                    }}
                  />
                  <Typography variant="body2" noWrap sx={{ minWidth: 0, flexGrow: 1 }}>
                    {formatPaint(paint)}
                  </Typography>
                  <Tooltip title="This paint isn't in your collection">
                    <Chip size="small" variant="outlined" label="not owned" sx={{ flexShrink: 0 }} />
                  </Tooltip>
                </Box>
              ) : (
                <Autocomplete
                  size="small"
                  sx={{ flexGrow: 1, minWidth: 0 }}
                  options={collection}
                  loading={isLoading}
                  value={owned ?? null}
                  isOptionEqualToValue={(option, selected) => option._id === selected._id}
                  getOptionLabel={(option) => formatPaint(option)}
                  onChange={(_, selected) => replaceAt(index, selected ? toStepPaint(selected) : { brand: "", name: "", hex: "", type: "" })}
                  renderOption={(props, option) => {
                    const { key: optionKey, ...optionProps } = props as typeof props & { key: string };
                    return (
                      <Box component="li" key={optionKey} {...optionProps} sx={{ display: "flex", gap: 1 }}>
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
                        <Typography variant="body2" sx={{ flexGrow: 1 }}>
                          {formatPaint(option)}
                        </Typography>
                        {option.type && (
                          <Typography variant="caption" color="text.secondary">
                            {option.type}
                          </Typography>
                        )}
                      </Box>
                    );
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Paint" placeholder="Pick from your collection" />
                  )}
                  noOptionsText="No paints yet - add one below"
                />
              )}

              <IconButton
                size="small"
                color="error"
                aria-label={`Remove paint ${index + 1}`}
                onClick={() => removeAt(index)}
                sx={{ flexShrink: 0 }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: paints.length ? 1 : 0 }}>
        <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ textTransform: "none" }}>
          Add paint
        </Button>
        <Button size="small" onClick={() => setDialogOpenFor(paints.length)} sx={{ textTransform: "none" }}>
          New paint...
        </Button>
      </Stack>

      {/* Adds to the collection and drops straight into the step, so a paint you have just
          opened doesn't need a detour to the paints page. */}
      <PaintFormDialog
        open={dialogOpenFor !== null}
        onClose={() => setDialogOpenFor(null)}
        onSaved={(created) => {
          const index = dialogOpenFor ?? paints.length;
          const next = [...paints];
          next[index] = toStepPaint(created);
          onChange(next);
          setDialogOpenFor(null);
        }}
      />
    </Box>
  );
}
