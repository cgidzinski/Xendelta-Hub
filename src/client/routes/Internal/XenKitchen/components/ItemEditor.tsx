import { useEffect, useRef, useState } from "react";
import {
  AppBar,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  InputAdornment,
  ListSubheader,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import LanguageIcon from "@mui/icons-material/Language";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { MAX_KITCHEN_IMAGES, type KitchenLayout } from "@shared/xenkitchen/kitchen";
import {
  canEditBook,
  useAddKitchenImageFromUrl,
  useCreateKitchenItem,
  useDeleteKitchenImage,
  useKitchenBooks,
  useKitchenCategories,
  useUpdateKitchenItem,
  useUploadKitchenImages,
  type ImportedKitchenRecipe,
  type KitchenItem,
} from "../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView } from "./kitchenIcons";
import { Draft, newKey, draftFrom, draftFromImport, inputFrom, filledExtras, Extra } from "./itemEditor/itemDraft";
import { ImportUrlDialog } from "./itemEditor/ImportUrlDialog";
import { PhotoStrip } from "./itemEditor/PhotoStrip";
import { TagField, quietInput } from "./itemEditor/editorFields";
import { RecipeFields } from "./itemEditor/RecipeFields";
import { InstructionFields } from "./itemEditor/InstructionFields";
const EXTRA_LABELS: Record<Extra, string> = {
  description: "Description",
  tags: "Tags",
  times: "Servings & time",
  brand: "Brand",
  storage: "Storage",
  notes: "Notes",
};
const EXTRAS_FOR: Record<KitchenLayout, Extra[]> = {
  recipe: ["description", "times", "tags", "notes"],
  instructions: ["brand", "storage", "description", "tags", "notes"],
};

/** "food.example.com" for a recipe's source link. */
const sourceHost = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// ---------- the editor ----------

interface ItemEditorProps {
  open: boolean;
  onClose: () => void;
  /** Edit this item; omit to create a new one. */
  item?: KitchenItem | null;
  defaultCategoryId?: string | null;
  /** Book a new item goes into; null asks (the picker starts on the first book you can edit). */
  defaultBookId?: string | null;
  onSaved?: (item: KitchenItem, created: boolean) => void;
}

export default function ItemEditor({
  open,
  onClose,
  item,
  defaultCategoryId = null,
  defaultBookId = null,
  onSaved,
}: ItemEditorProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { books } = useKitchenBooks();
  const editableBooks = books.filter((b) => canEditBook(b.my_role));
  const [bookId, setBookId] = useState<string>("");
  useEffect(() => {
    if (!open) return;
    setBookId(item?.book_id ?? defaultBookId ?? editableBooks[0]?._id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?._id, defaultBookId, books.length]);
  const { categories } = useKitchenCategories(bookId || "all");
  const create = useCreateKitchenItem();
  const update = useUpdateKitchenItem();
  const upload = useUploadKitchenImages();
  const addFromUrl = useAddKitchenImageFromUrl();
  const deleteImage = useDeleteKitchenImage();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(item, defaultCategoryId));
  const initial = useRef("");
  // Existing photos, in display order, minus any removed in this session.
  const [photos, setPhotos] = useState<KitchenItem["images"]>([]);
  const [newFiles, setNewFiles] = useState<Array<{ key: string; file: File; url: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<Set<Extra>>(new Set());
  // Importing from a web address: the dialog, and the page's photo, which is added once the item is saved.
  const [importOpen, setImportOpen] = useState(false);
  const [importedImage, setImportedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = draftFrom(item, defaultCategoryId);
    setDraft(d);
    setOpened(filledExtras(d));
    initial.current = JSON.stringify(inputFrom(d));
    setPhotos(item?.images ?? []);
    setNewFiles([]);
    setImportedImage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?._id]);

  useEffect(() => () => newFiles.forEach((f) => URL.revokeObjectURL(f.url)), [newFiles]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const category = categories.find((c) => c._id === draft.category_id);
  const layout: KitchenLayout = category?.layout ?? "recipe";
  const accent = category?.color ?? theme.palette.primary.main;

  const dirty =
    JSON.stringify(inputFrom(draft)) !== initial.current ||
    newFiles.length > 0 ||
    photos.map((p) => p._id).join() !== (item?.images ?? []).map((p) => p._id).join();

  const requestClose = async () => {
    if (saving) return;
    if (
      dirty &&
      !(await confirm({
        title: "Discard changes?",
        message: "Your edits haven't been saved.",
        confirmLabel: "Discard",
        destructive: false,
      }))
    )
      return;
    onClose();
  };

  const totalPhotos = photos.length + newFiles.length;
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_KITCHEN_IMAGES - totalPhotos;
    const picked = [...files]
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .slice(0, room);
    if (files.length > room) enqueueSnackbar(`Up to ${MAX_KITCHEN_IMAGES} photos per item`, { variant: "info" });
    setNewFiles((prev) => [
      ...prev,
      ...picked.map((file) => ({ key: newKey(), file, url: URL.createObjectURL(file) })),
    ]);
  };

  const applyImport = (recipe: ImportedKitchenRecipe) => {
    const d = draftFromImport(recipe, draft.category_id);
    setDraft(d);
    setOpened(filledExtras(d));
    setImportedImage(recipe.image_url);
    enqueueSnackbar("Recipe imported. Have a look, then save it.", { variant: "success" });
  };

  const save = async () => {
    setSaving(true);
    const input = inputFrom(draft);
    try {
      let saved: KitchenItem;
      if (item) {
        const removed = item.images.filter((img) => !photos.some((p) => p._id === img._id));
        for (const img of removed) await deleteImage.mutateAsync({ id: item._id, imageId: img._id });
        saved = (await update.mutateAsync({ id: item._id, patch: { ...input, image_order: photos.map((p) => p._id) } }))
          .item;
      } else {
        saved = (await create.mutateAsync({ ...input, book_id: bookId })).item;
      }
      // The imported page's photo, unless there's no room or the person added their own. A failure never loses the recipe.
      if (importedImage && !item && newFiles.length === 0) {
        try {
          saved = (await addFromUrl.mutateAsync({ id: saved._id, url: importedImage })).item;
        } catch {
          enqueueSnackbar("Saved, but the photo from the page couldn't be added", { variant: "warning" });
        }
      }
      if (newFiles.length) {
        try {
          saved = (await upload.mutateAsync({ id: saved._id, files: newFiles.map((f) => f.file) })).item;
        } catch (e: any) {
          enqueueSnackbar(e?.response?.data?.message ?? "Saved, but some photos didn't upload", { variant: "warning" });
        }
      }
      enqueueSnackbar(item ? "Saved" : "Added to your kitchen", { variant: "success" });
      onSaved?.(saved, !item);
      onClose();
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message ?? "Couldn't save", { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && !!bookId && (draft.title.trim() !== "" || totalPhotos > 0);
  const extras = EXTRAS_FOR[layout];
  const shown = extras.filter((e) => opened.has(e));
  const hidden = extras.filter((e) => !opened.has(e));
  const openExtra = (e: Extra) => setOpened((o) => new Set(o).add(e));

  return (
    <Dialog open={open} onClose={requestClose} fullScreen={phone} fullWidth maxWidth="sm">
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Toolbar sx={{ gap: 1 }} variant="dense">
          <IconButton edge="start" onClick={requestClose} aria-label="Close">
            <CloseIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }} noWrap>
            {item ? "Edit" : "New"}
          </Typography>
          <Button
            variant="contained"
            onClick={save}
            disabled={!canSave}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {saving ? "Saving" : "Save"}
          </Button>
        </Toolbar>
      </AppBar>

      <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 4 }}>
        <PhotoStrip
          photos={photos}
          newFiles={newFiles}
          accent={accent}
          canAdd={totalPhotos < MAX_KITCHEN_IMAGES}
          onAdd={addFiles}
          onRemovePhoto={(id) => setPhotos((p) => p.filter((x) => x._id !== id))}
          onCoverPhoto={(id) => setPhotos((p) => [...p.filter((x) => x._id === id), ...p.filter((x) => x._id !== id)])}
          onRemoveNew={(key) => setNewFiles((f) => f.filter((x) => x.key !== key))}
          hint={layout === "instructions" ? "Snap the box" : "Add a photo"}
        />

        {!item && (
          <Button
            size="small"
            startIcon={<LanguageIcon />}
            onClick={() => setImportOpen(true)}
            sx={{ mt: 1.5, px: 0, textTransform: "none" }}
          >
            Import from a web address
          </Button>
        )}

        <TextField
          variant="standard"
          fullWidth
          autoFocus={!item}
          placeholder={layout === "instructions" ? "What's in the box?" : "Recipe name"}
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          sx={{ mt: 2, ...quietInput }}
          slotProps={{ htmlInput: { maxLength: 120, "aria-label": "Title", style: { fontSize: 26, fontWeight: 800 } } }}
        />

        {(draft.source_url || importedImage) && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
            {draft.source_url && (
              <Chip
                size="small"
                icon={<LanguageIcon />}
                label={`From ${sourceHost(draft.source_url)}`}
                onDelete={() => set({ source_url: "" })}
              />
            )}
            {importedImage && !item && (
              <Chip size="small" label="The page's photo will be added" onDelete={() => setImportedImage(null)} />
            )}
          </Stack>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
          <TextField
            select
            size="small"
            value={draft.category_id ?? ""}
            onChange={(e) => set({ category_id: e.target.value || null })}
            sx={{ minWidth: 180 }}
            slotProps={{
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

          {!item && editableBooks.length > 1 && (
            <TextField
              select
              size="small"
              value={bookId}
              sx={{ minWidth: 160 }}
              onChange={(e) => {
                setBookId(e.target.value);
                set({ category_id: null });
              }}
              slotProps={{ htmlInput: { "aria-label": "Recipe book" } }}
            >
              {editableBooks.map((b) => (
                <MenuItem key={b._id} value={b._id}>
                  <CategoryIconView
                    icon={b.icon}
                    sx={{ fontSize: 18, color: b.color, mr: 1, verticalAlign: "middle" }}
                  />
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>

        {layout === "recipe" ? (
          <RecipeFields draft={draft} set={set} accent={accent} />
        ) : (
          <InstructionFields draft={draft} set={set} accent={accent} />
        )}

        {/* Optional details */}
        {shown.length > 0 && (
          <Stack spacing={2} sx={{ mt: 3 }}>
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
                case "tags":
                  return <TagField key={e} value={draft.tags} onChange={(tags) => set({ tags })} />;
                case "times":
                  return (
                    <Stack key={e} direction="row" spacing={1.5}>
                      <TextField
                        label="Serves"
                        type="number"
                        size="small"
                        value={draft.servings}
                        onChange={(ev) => set({ servings: ev.target.value })}
                        fullWidth
                        slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }}
                      />
                      <TextField
                        label="Prep"
                        type="number"
                        size="small"
                        value={draft.prep_minutes}
                        onChange={(ev) => set({ prep_minutes: ev.target.value })}
                        fullWidth
                        slotProps={{
                          htmlInput: { min: 0, inputMode: "numeric" },
                          input: { endAdornment: <InputAdornment position="end">min</InputAdornment> },
                        }}
                      />
                      <TextField
                        label="Cook"
                        type="number"
                        size="small"
                        value={draft.cook_minutes}
                        onChange={(ev) => set({ cook_minutes: ev.target.value })}
                        fullWidth
                        slotProps={{
                          htmlInput: { min: 0, inputMode: "numeric" },
                          input: { endAdornment: <InputAdornment position="end">min</InputAdornment> },
                        }}
                      />
                    </Stack>
                  );
                case "brand":
                  return (
                    <TextField
                      key={e}
                      label="Brand"
                      size="small"
                      value={draft.brand}
                      onChange={(ev) => set({ brand: ev.target.value })}
                      fullWidth
                      slotProps={{ htmlInput: { maxLength: 80 } }}
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
              }
            })}
          </Stack>
        )}
        {hidden.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 3 }}>
            {hidden.map((e) => (
              <Chip
                key={e}
                icon={<AddIcon />}
                label={EXTRA_LABELS[e]}
                variant="outlined"
                onClick={() => openExtra(e)}
              />
            ))}
          </Stack>
        )}
      </DialogContent>
      <ImportUrlDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={applyImport} />
    </Dialog>
  );
}
