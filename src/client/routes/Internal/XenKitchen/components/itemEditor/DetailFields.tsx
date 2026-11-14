import { Box, Chip, InputBase, ListSubheader, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { type KitchenLayout } from "@shared/xenkitchen/kitchen";
import { type KitchenBook, type KitchenCategory } from "../../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView } from "../kitchenIcons";
import { cardSx } from "../../../../../components/ui/surfaceStyles";
import { Draft, Extra } from "./itemDraft";

type SetDraft = (p: Partial<Draft>) => void;

const EXTRA_LABELS: Record<Extra, string> = {
  description: "Description",
  times: "Servings & time",
  brand: "Brand",
  storage: "Storage",
  notes: "Notes",
};
// Serves / time (recipes) and brand (box instructions) are always shown; these are the optional extras.
export const EXTRAS_FOR: Record<KitchenLayout, Extra[]> = {
  recipe: ["description", "notes"],
  instructions: ["storage", "description", "notes"],
};

// The few facts every recipe has (where it is kept, how long it takes) read as two small panels of labelled cells,
// not a pile of loose inputs: a caption on top of each value, hairlines between, a tint where you are typing.
const panelSx = { ...cardSx, overflow: "hidden", bgcolor: "background.paper" } as const;
const cellSx = {
  px: 1.5,
  py: 1,
  minWidth: 0,
  transition: "background-color 120ms",
  "&:hover, &:focus-within": { bgcolor: "action.hover" },
} as const;
const captionSx = { display: "block", color: "text.secondary", fontWeight: 600, lineHeight: 1.4 } as const;
const valueSx = { fontSize: 15, fontWeight: 500 } as const;

/** A labelled cell. Wrapping in a label means a tap anywhere in the cell goes to its field. */
function Cell({ label, children, sx }: { label: string; children: React.ReactNode; sx?: object }) {
  return (
    <Box component="label" sx={{ ...cellSx, display: "block", cursor: "text", ...sx }}>
      <Typography variant="caption" sx={captionSx}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

/** Which book the item is in, and its category. */
export function CategoryBookFields({
  draft,
  set,
  categories,
  books,
  bookId,
  onBook,
  bookLocked = false,
}: {
  draft: Draft;
  set: SetDraft;
  categories: KitchenCategory[];
  /** Books the item can go into. */
  books: KitchenBook[];
  bookId: string;
  onBook: (id: string) => void;
  /** An item that already exists stays in its book: the book is shown but can't be changed here. */
  bookLocked?: boolean;
}) {
  const current = books.find((b) => b._id === bookId);
  const choose = !bookLocked && books.length > 1;
  const bookValue = (b?: KitchenBook) => (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <CategoryIconView icon={b?.icon} sx={{ fontSize: 18, color: b?.color ?? "text.disabled" }} />
      <Typography noWrap sx={valueSx}>
        {b?.name ?? ""}
      </Typography>
    </Stack>
  );
  const picker = {
    variant: "standard" as const,
    fullWidth: true,
    select: true,
    // No box and no underline: the panel is the field.
    slotProps: { input: { disableUnderline: true } },
  };

  return (
    <Box sx={panelSx}>
      {/* Every recipe lives in a book, so it is always shown: a picker when there is a choice, else the name. */}
      <Cell label="Book" sx={{ cursor: choose ? "pointer" : "default" }}>
        {choose ? (
          <TextField
            {...picker}
            value={bookId}
            onChange={(e) => {
              onBook(e.target.value);
              set({ category_id: null });
            }}
            slotProps={{
              input: { disableUnderline: true },
              select: { renderValue: (v) => bookValue(books.find((b) => b._id === v)) },
              htmlInput: { "aria-label": "Recipe book" },
            }}
          >
            {books.map((b) => (
              <MenuItem key={b._id} value={b._id}>
                <CategoryIconView icon={b.icon} sx={{ fontSize: 18, color: b.color, mr: 1.5 }} />
                {b.name}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Box aria-label="Recipe book" role="group" sx={{ py: 0.5 }}>
            {bookValue(current)}
          </Box>
        )}
      </Cell>
      <Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />
      <Cell label="Category" sx={{ cursor: "pointer" }}>
        <TextField
          {...picker}
          value={draft.category_id ?? ""}
          onChange={(e) => set({ category_id: e.target.value || null })}
          slotProps={{
            input: { disableUnderline: true },
            select: {
              displayEmpty: true,
              renderValue: (v) => {
                const c = categories.find((x) => x._id === v);
                return (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <CategoryIconView icon={c?.icon} sx={{ fontSize: 18, color: c?.color ?? "text.disabled" }} />
                    <Typography noWrap sx={{ ...valueSx, color: c ? "text.primary" : "text.secondary" }}>
                      {c?.name ?? "No category"}
                    </Typography>
                  </Stack>
                );
              },
            },
            htmlInput: { "aria-label": "Category" },
          }}
        >
          {(["recipe", "instructions"] as KitchenLayout[]).flatMap((group) => {
            const list = categories.filter((c) => c.layout === group);
            if (!list.length) return [];
            return [
              <ListSubheader key={`h-${group}`}>{group === "recipe" ? "Recipes" : "Instructions"}</ListSubheader>,
              ...list.map((c) => (
                <MenuItem key={c._id} value={c._id}>
                  <CategoryIconView icon={c.icon} sx={{ fontSize: 18, color: c.color, mr: 1.5 }} />
                  {c.name}
                </MenuItem>
              )),
            ];
          })}
          <MenuItem value="">No category</MenuItem>
        </TextField>
      </Cell>
    </Box>
  );
}

/** Serves, prep and cook time for a recipe, side by side; the brand for box instructions. */
export function QuickFacts({ draft, set, layout }: { draft: Draft; set: SetDraft; layout: KitchenLayout }) {
  if (layout === "instructions") {
    return (
      <Box sx={panelSx}>
        <Cell label="Brand">
          <InputBase
            fullWidth
            placeholder="e.g. Acme"
            value={draft.brand}
            onChange={(ev) => set({ brand: ev.target.value })}
            inputProps={{ maxLength: 80, "aria-label": "Brand" }}
            sx={valueSx}
          />
        </Cell>
      </Box>
    );
  }
  const number = (label: string, key: "servings" | "prep_minutes" | "cook_minutes", unit: string, first = false) => (
    <Cell label={label} sx={{ flex: 1, ...(first ? {} : { borderLeft: "1px solid", borderColor: "divider" }) }}>
      <InputBase
        fullWidth
        type="number"
        placeholder="–"
        value={draft[key]}
        onChange={(ev) => set({ [key]: ev.target.value })}
        inputProps={{ min: 0, inputMode: "numeric", "aria-label": label }}
        endAdornment={
          unit ? (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              {unit}
            </Typography>
          ) : undefined
        }
        sx={valueSx}
      />
    </Cell>
  );
  return (
    <Stack direction="row" sx={panelSx}>
      {number("Serves", "servings", "", true)}
      {number("Prep", "prep_minutes", "min")}
      {number("Cook", "cook_minutes", "min")}
    </Stack>
  );
}

/** The optional extras that are open, then a chip to open each of the rest. */
export function ExtraFields({
  draft,
  set,
  shown,
  hidden,
  onOpen,
}: {
  draft: Draft;
  set: SetDraft;
  shown: Extra[];
  hidden: Extra[];
  onOpen: (e: Extra) => void;
}) {
  return (
    <>
      {shown.length > 0 && (
        <Stack spacing={2} sx={{ mt: 1 }}>
          {shown.map((e) => {
            switch (e) {
              case "description":
                return (
                  <TextField
                    key={e}
                    label="Description"
                    value={draft.description}
                    onChange={(ev) => set({ description: ev.target.value })}
                    fullWidth
                    multiline
                    minRows={2}
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                  />
                );
              case "storage":
                return (
                  <TextField
                    key={e}
                    label="Storage"
                    size="small"
                    value={draft.storage_note}
                    onChange={(ev) => set({ storage_note: ev.target.value })}
                    fullWidth
                    multiline
                    placeholder="Keep frozen. Do not refreeze."
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                  />
                );
              case "notes":
                return (
                  <TextField
                    key={e}
                    label="Notes"
                    value={draft.notes}
                    onChange={(ev) => set({ notes: ev.target.value })}
                    fullWidth
                    multiline
                    minRows={2}
                    slotProps={{ htmlInput: { maxLength: 4000 } }}
                  />
                );
              default:
                return null;
            }
          })}
        </Stack>
      )}
      {hidden.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: shown.length ? 2 : 0.5 }}>
          {hidden.map((e) => (
            <Chip key={e} icon={<AddIcon />} label={EXTRA_LABELS[e]} variant="outlined" onClick={() => onOpen(e)} />
          ))}
        </Stack>
      )}
    </>
  );
}
