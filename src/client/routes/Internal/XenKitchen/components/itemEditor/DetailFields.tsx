import { Chip, InputAdornment, ListSubheader, MenuItem, Stack, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { type KitchenLayout } from "@shared/xenkitchen/kitchen";
import { type KitchenBook, type KitchenCategory } from "../../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView } from "../kitchenIcons";
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

/** The category picker (grouped by layout) and, for a new item with more than one book to pick from, the book. */
export function CategoryBookFields({
  draft,
  set,
  categories,
  books,
  bookId,
  onBook,
  bookLocked = false,
  stacked = false,
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
  /** One field per line, full width (the desktop sidebar). */
  stacked?: boolean;
}) {
  return (
    <Stack direction={stacked ? "column" : "row"} spacing={stacked ? 1.5 : 1} useFlexGap flexWrap="wrap">
      {/* Every recipe lives in a book, so the book is always shown: a picker when there is a choice, else the name. */}
      {(() => {
        const current = books.find((b) => b._id === bookId);
        const choose = !bookLocked && books.length > 1;
        return (
          <TextField
            select={choose}
            size="small"
            label="In book"
            value={choose ? bookId : (current?.name ?? "")}
            fullWidth={stacked}
            sx={stacked ? undefined : { minWidth: 200 }}
            onChange={(e) => {
              onBook(e.target.value);
              set({ category_id: null });
            }}
            helperText={choose || bookLocked ? undefined : "Recipes are kept in a book. Add more books from the list."}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { "aria-label": "Recipe book", readOnly: !choose },
              input: choose
                ? undefined
                : {
                    readOnly: true,
                    startAdornment: current ? (
                      <CategoryIconView
                        icon={current.icon}
                        sx={{ fontSize: 18, color: current.color, mr: 1, verticalAlign: "middle" }}
                      />
                    ) : undefined,
                  },
            }}
          >
            {choose &&
              books.map((b) => (
                <MenuItem key={b._id} value={b._id}>
                  <CategoryIconView
                    icon={b.icon}
                    sx={{ fontSize: 18, color: b.color, mr: 1, verticalAlign: "middle" }}
                  />
                  {b.name}
                </MenuItem>
              ))}
          </TextField>
        );
      })()}

      <TextField
        select
        size="small"
        label={stacked ? "Category" : undefined}
        value={draft.category_id ?? ""}
        onChange={(e) => set({ category_id: e.target.value || null })}
        fullWidth={stacked}
        sx={stacked ? undefined : { minWidth: 180 }}
        slotProps={{
          inputLabel: stacked ? { shrink: true } : undefined,
          select: {
            displayEmpty: true,
            renderValue: (v) => {
              const c = categories.find((x) => x._id === v);
              return (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CategoryIconView icon={c?.icon} sx={{ fontSize: 18, color: c?.color ?? "text.disabled" }} />
                  <span>{c?.name ?? "No category"}</span>
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
    </Stack>
  );
}

/** Serves, prep and cook time for a recipe; the brand for box instructions. */
export function QuickFacts({
  draft,
  set,
  layout,
  stacked = false,
}: {
  draft: Draft;
  set: SetDraft;
  layout: KitchenLayout;
  /** Serves on its own line, prep and cook side by side under it (the desktop sidebar). */
  stacked?: boolean;
}) {
  if (layout === "instructions") {
    return (
      <TextField
        label="Brand"
        size="small"
        value={draft.brand}
        onChange={(ev) => set({ brand: ev.target.value })}
        fullWidth
        slotProps={{ htmlInput: { maxLength: 80 } }}
      />
    );
  }
  const timeField = (label: string, key: "prep_minutes" | "cook_minutes") => (
    <TextField
      label={label}
      type="number"
      size="small"
      value={draft[key]}
      onChange={(ev) => set({ [key]: ev.target.value })}
      fullWidth
      slotProps={{
        htmlInput: { min: 0, inputMode: "numeric" },
        input: { endAdornment: <InputAdornment position="end">min</InputAdornment> },
      }}
    />
  );
  const serves = (
    <TextField
      label="Serves"
      type="number"
      size="small"
      value={draft.servings}
      onChange={(ev) => set({ servings: ev.target.value })}
      fullWidth
      slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }}
    />
  );
  if (stacked) {
    return (
      <Stack spacing={1.5}>
        {serves}
        <Stack direction="row" spacing={1.5}>
          {timeField("Prep", "prep_minutes")}
          {timeField("Cook", "cook_minutes")}
        </Stack>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={1.5}>
      {serves}
      {timeField("Prep", "prep_minutes")}
      {timeField("Cook", "cook_minutes")}
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
