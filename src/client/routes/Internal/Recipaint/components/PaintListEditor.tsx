import { useMemo, useState } from "react";
import { Autocomplete, Box, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import {
  RecipePaint,
  catalogueKey,
  describePaintDetail,
  formatPaint,
  paintKey,
} from "../../../../../shared/recipaint/paints";
import { CollectionPaint, usePaints } from "../../../../hooks/recipaint/usePaints";
import { usePaintCatalogueSearch } from "../../../../hooks/recipaint/usePaintCatalogue";
import PaintFormDialog from "./PaintFormDialog";

interface PaintListEditorProps {
  paints: RecipePaint[];
  onChange: (paints: RecipePaint[]) => void;
}

const OWNED_GROUP = "Your paints";
const CATALOGUE_GROUP = "All paints";

interface PickerOption {
  /** Unique within the option list: the React key and the equality test. */
  id: string;
  kind: "owned" | "catalogue" | "unowned" | "create";
  brand: string;
  name: string;
  range: string;
  hex: string;
  type: RecipePaint["type"];
}

const EMPTY_PAINT: RecipePaint = { brand: "", name: "", hex: "", type: "" };

const isBlank = (paint: RecipePaint) => !paint.name.trim() && !paint.brand.trim();

/** A step stores a snapshot, not a reference - that is what keeps a shared recipe readable. */
const toStepPaint = (option: PickerOption): RecipePaint => ({
  brand: option.brand,
  name: option.name,
  hex: option.hex,
  type: option.type,
});

const labelFor = (option: PickerOption) => {
  if (option.kind === "create") return option.name;
  const base = formatPaint(option);
  return option.range ? `${base} (${option.range})` : base;
};

export default function PaintListEditor({ paints, onChange }: PaintListEditorProps) {
  const { paints: collection } = usePaints();
  const [query, setQuery] = useState("");
  const [createFor, setCreateFor] = useState<{ index: number; name: string } | null>(null);

  // Only the row being typed into queries the catalogue; every row renders the same option
  // list, which is correct because only one can have focus.
  const { paints: catalogueResults, isSearching } = usePaintCatalogueSearch(query);

  // Matching a step's snapshot to your shelf goes through paintKey (brand+name) because a
  // step carries no range.
  const ownedByPaintKey = useMemo(() => {
    const map = new Map<string, CollectionPaint>();
    for (const paint of collection) {
      map.set(paintKey({ brand: paint.brand, name: paint.name, hex: "", type: "" }), paint);
    }
    return map;
  }, [collection]);

  const options = useMemo<PickerOption[]>(() => {
    const needle = query.trim().toLowerCase();

    const owned: PickerOption[] = collection
      .filter((paint) => !needle || `${paint.brand} ${paint.range} ${paint.name}`.toLowerCase().includes(needle))
      .map((paint) => ({
        id: `owned:${paint._id}`,
        kind: "owned",
        brand: paint.brand,
        name: paint.name,
        range: paint.range,
        hex: paint.hex,
        type: paint.type,
      }));

    // A paint already on the shelf must not appear twice; the owned entry wins.
    const ownedIdentities = new Set(
      collection.flatMap((paint) => [
        paint.catalogueKey,
        catalogueKey({ brand: paint.brand, range: paint.range, name: paint.name }),
      ]),
    );

    const catalogue: PickerOption[] = catalogueResults
      .filter((entry) => !ownedIdentities.has(entry.key))
      .map((entry) => ({
        id: `catalogue:${entry.key}`,
        kind: "catalogue",
        brand: entry.brand,
        name: entry.name,
        range: entry.range,
        hex: entry.hex,
        type: entry.type,
      }));

    const combined = [...owned, ...catalogue];

    // "New paint" is a last resort: it only appears once nothing owned or in the catalogue
    // matches what has been typed.
    if (needle && combined.length === 0) {
      combined.push({
        id: "create",
        kind: "create",
        brand: "",
        name: query.trim(),
        range: "",
        hex: "",
        type: "",
      });
    }

    return combined;
  }, [collection, catalogueResults, query]);

  /** The option a row currently shows. Built from the step's own snapshot so a paint that is
   *  neither owned nor in the current search results still displays. */
  const valueFor = (paint: RecipePaint): PickerOption | null => {
    if (isBlank(paint)) return null;
    const owned = ownedByPaintKey.get(paintKey(paint));
    if (owned) {
      return {
        id: `owned:${owned._id}`,
        kind: "owned",
        brand: owned.brand,
        name: owned.name,
        range: owned.range,
        hex: owned.hex,
        type: owned.type,
      };
    }
    return {
      id: `unowned:${paintKey(paint)}`,
      kind: "unowned",
      brand: paint.brand,
      name: paint.name,
      range: "",
      hex: paint.hex,
      type: paint.type,
    };
  };

  /**
   * Rows are implicit: the list always ends in one blank picker, so filling the last row grows
   * the list and clearing a row removes it. There is no add or remove button to hunt for.
   */
  const rows = [...paints, EMPTY_PAINT];

  const setRow = (index: number, paint: RecipePaint | null) => {
    const next = [...paints];
    if (!paint || isBlank(paint)) {
      // Clearing an existing row drops it; clearing the trailing blank does nothing.
      if (index < paints.length) next.splice(index, 1);
    } else if (index < paints.length) {
      next[index] = paint;
    } else {
      next.push(paint);
    }
    onChange(next);
  };

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
        Paints
      </Typography>

      <Stack spacing={1}>
        {rows.map((paint, index) => {
          const isTrailing = index === paints.length;
          const value = valueFor(paint);

          return (
            <Stack key={index} direction="row" spacing={0.5} alignItems="center">
              <Autocomplete
                size="small"
                sx={{ flexGrow: 1, minWidth: 0 }}
                options={options}
                loading={isSearching}
                value={value}
                // Filtering happens above, over the owned list and the server's results.
                filterOptions={(all) => all}
                groupBy={(option) => (option.kind === "owned" ? OWNED_GROUP : option.kind === "catalogue" ? CATALOGUE_GROUP : "")}
                isOptionEqualToValue={(option, selected) => option.id === selected.id}
                getOptionLabel={labelFor}
                onInputChange={(_, text, reason) => {
                  if (reason === "input") setQuery(text);
                }}
                onChange={(_, selected) => {
                  if (selected?.kind === "create") {
                    setCreateFor({ index, name: selected.name });
                    return;
                  }
                  setRow(index, selected ? toStepPaint(selected) : null);
                  setQuery("");
                }}
                renderOption={(props, option) => {
                  const { key: _labelKey, ...optionProps } = props as typeof props & { key: string };
                  return (
                    // Keyed on our own id: two paints can share a brand and name across ranges,
                    // and MUI's default key comes from the label.
                    <Box component="li" key={option.id} {...optionProps} sx={{ display: "flex", gap: 1, alignItems: "flex-start", minWidth: 0 }}>
                      {option.kind === "create" ? (
                        <>
                          <AddIcon fontSize="small" color="primary" />
                          <Typography variant="body2">
                            Add &quot;{option.name}&quot; as a new paint
                          </Typography>
                        </>
                      ) : (
                        <>
                          <Box
                            sx={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              flexShrink: 0,
                              mt: 0.25,
                              border: "1px solid",
                              borderColor: "divider",
                              backgroundColor: option.hex || "transparent",
                            }}
                          />
                          {/* Stacked, and everything after the name is one truncated caption:
                              on a phone a brand, range and type side by side do not fit. */}
                          <Box sx={{ minWidth: 0, flexGrow: 1, overflow: "hidden" }}>
                            <Typography variant="body2" noWrap>
                              {option.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                              {describePaintDetail(option)}
                            </Typography>
                          </Box>
                          {option.kind === "owned" && (
                            <CheckIcon fontSize="small" color="success" sx={{ flexShrink: 0, mt: 0.25 }} />
                          )}
                        </>
                      )}
                    </Box>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={isTrailing ? "Add a paint" : "Paint"}
                    placeholder="Search your paints and the catalogue..."
                  />
                )}
                noOptionsText={query ? "No matching paints" : "Start typing to search"}
              />

              {/* A paint you do not own still reads clearly - useful on a cloned recipe - but as
                  a 16px marker rather than a chip, which ate most of a phone's row width. */}
              {value?.kind === "unowned" && (
                <Tooltip title="Not in your paints">
                  <ErrorOutlineIcon fontSize="small" color="disabled" sx={{ flexShrink: 0 }} />
                </Tooltip>
              )}

              {!isTrailing && (
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Remove paint ${index + 1}`}
                  onClick={() => setRow(index, null)}
                  sx={{ flexShrink: 0 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          );
        })}
      </Stack>

      {/* Reached only from the "Add ... as a new paint" option, so it opens on the custom form:
          the catalogue has already been searched and came up empty. */}
      <PaintFormDialog
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        initialName={createFor?.name}
        defaultTab="custom"
        onSaved={(created) => {
          if (createFor) {
            setRow(createFor.index, {
              brand: created.brand,
              name: created.name,
              hex: created.hex,
              type: created.type,
            });
          }
          setCreateFor(null);
          setQuery("");
        }}
      />
    </Box>
  );
}
