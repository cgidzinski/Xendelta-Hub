import { useMemo, useState } from "react";
import { Button, Checkbox, FormControlLabel, FormGroup, Stack, Switch, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { EMPTY_FILTERS } from "@shared/xenkitchen/kitchen";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useKitchenCategories, useKitchenItems, type KitchenItem } from "../../../../hooks/xenkitchen/useKitchen";
import {
  buildCookbook,
  cookbookParams,
  DEFAULT_COOKBOOK_OPTIONS,
  NO_CATEGORY,
  type CookbookCategory,
  type CookbookOptions,
} from "./cookbook";

interface DialogProps {
  bookName: string;
  categories: CookbookCategory[];
  items: KitchenItem[];
  onClose: () => void;
  onExport: (options: CookbookOptions) => void;
}

/** Choose what goes into the cookbook PDF: which categories, with or without photos, and favourites only. */
export function ExportBookDialog({ bookName, categories, items, onClose, onExport }: DialogProps) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items)
      counts.set(i.category?._id ?? NO_CATEGORY, (counts.get(i.category?._id ?? NO_CATEGORY) ?? 0) + 1);
    const list = categories.map((c) => ({ id: c._id, name: c.name, count: counts.get(c._id) ?? 0 }));
    if (counts.get(NO_CATEGORY))
      list.push({ id: NO_CATEGORY, name: "Other recipes", count: counts.get(NO_CATEGORY) ?? 0 });
    return list.filter((r) => r.count > 0);
  }, [items, categories]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState(DEFAULT_COOKBOOK_OPTIONS.photos);
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const options: CookbookOptions = {
    categories: skipped.size === 0 ? null : rows.map((r) => r.id).filter((id) => !skipped.has(id)),
    photos,
    favouritesOnly,
  };
  const recipes = buildCookbook(items, categories, options).reduce((n, s) => n + s.items.length, 0);

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title={`Export ${bookName} as PDF`}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={recipes === 0} onClick={() => onExport(options)}>
            Export
          </Button>
        </>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Makes a cookbook with a cover, a contents and a page for each recipe. Save it as a PDF from the print window.
      </Typography>
      <Typography variant="overline" color="text.secondary">
        Categories
      </Typography>
      <FormGroup sx={{ mb: 1.5 }}>
        {rows.map((r) => (
          <FormControlLabel
            key={r.id}
            control={
              <Checkbox
                checked={!skipped.has(r.id)}
                onChange={(_, on) =>
                  setSkipped((prev) => {
                    const next = new Set(prev);
                    if (on) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
              />
            }
            label={`${r.name} (${r.count})`}
          />
        ))}
      </FormGroup>
      <Stack>
        <FormControlLabel
          control={<Switch checked={photos} onChange={(_, on) => setPhotos(on)} />}
          label="Include photos"
        />
        <FormControlLabel
          control={<Switch checked={favouritesOnly} onChange={(_, on) => setFavouritesOnly(on)} />}
          label="Favourites only"
        />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {recipes === 0 ? "No recipes match." : `${recipes} ${recipes === 1 ? "recipe" : "recipes"} will be included.`}
      </Typography>
    </ResponsiveDialog>
  );
}

/** The export dialog for one of your own books: loads its recipes, then goes to the print page. */
export default function MyExportBookDialog({
  bookId,
  bookName,
  onClose,
}: {
  bookId: string;
  bookName: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { categories } = useKitchenCategories(bookId);
  const { items } = useKitchenItems(EMPTY_FILTERS, bookId);
  return (
    <ExportBookDialog
      bookName={bookName}
      categories={categories}
      items={items}
      onClose={onClose}
      onExport={(options) => navigate(`/internal/xenkitchen/books/${bookId}/print?${cookbookParams(options)}`)}
    />
  );
}
