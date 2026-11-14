import { useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import LanguageIcon from "@mui/icons-material/Language";
import LinkIcon from "@mui/icons-material/Link";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { RADIUS } from "../../../../theme";
import { MAX_KITCHEN_IMAGES, type KitchenLayout } from "@shared/xenkitchen/kitchen";
import {
  canEditBook,
  useAddKitchenImageFromUrl,
  useCreateKitchenItem,
  useDeleteKitchenImage,
  useKitchenBooks,
  useKitchenCategories,
  useUpdateKitchenItem,
  usePhotoImportEnabled,
  useUploadKitchenImages,
  type ImportedKitchenRecipe,
  type KitchenItem,
} from "../../../../hooks/xenkitchen/useKitchen";
import { Draft, newKey, draftFrom, draftFromImport, inputFrom, filledExtras, Extra } from "./itemEditor/itemDraft";
import { ImportDialog, type ImportMode } from "./itemEditor/ImportDialog";
import { PhotoStrip } from "./itemEditor/PhotoStrip";
import { SectionTitle, quietInput } from "./itemEditor/editorFields";
import { RecipeFields } from "./itemEditor/RecipeFields";
import { InstructionFields } from "./itemEditor/InstructionFields";
import { CategoryBookFields, EXTRAS_FOR, ExtraFields, QuickFacts } from "./itemEditor/DetailFields";

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
  // Two panes (details sidebar, recipe main) from md up; below that the single-column flow.
  const wide = useMediaQuery(theme.breakpoints.up("md"));
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
  const [importing, setImporting] = useState<{ mode: ImportMode; url?: string } | null>(null);
  const photoImport = usePhotoImportEnabled();
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

  const applyImport = (recipe: ImportedKitchenRecipe, photo?: File) => {
    const d = draftFromImport(recipe, draft.category_id);
    setDraft(d);
    setOpened(filledExtras(d));
    setImportedImage(recipe.image_url);
    // A photo the recipe was read from is the recipe's picture: it goes up with the save like any other added photo.
    if (photo && totalPhotos < MAX_KITCHEN_IMAGES) {
      setNewFiles((prev) => [...prev, { key: newKey(), file: photo, url: URL.createObjectURL(photo) }]);
    }
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

  const saveLabel = saving ? "Saving" : item ? "Save" : "Save recipe";
  const saveIcon = saving ? <CircularProgress size={16} color="inherit" /> : undefined;
  const status = dirty ? "Unsaved changes" : item ? "All changes saved" : "Not saved yet";
  const noun = layout === "instructions" ? "item" : "recipe";
  const heading = item ? `Edit ${item.title || noun}` : `New ${noun}`;

  // A new, still empty item can start from a recipe somewhere else: a web page or photos of it.
  const importBanner = !item && !draft.title.trim() && (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "stretch", sm: "center" }}
      spacing={1}
      sx={{
        mb: 2,
        p: 1.5,
        borderRadius: RADIUS.lg,
        border: "1px solid",
        borderColor: (t) => alpha(t.palette.primary.main, 0.3),
        bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Already have this recipe somewhere?
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {photoImport
            ? "Bring it in from a web page or photos, then check it over."
            : "Bring it in from a web page, then check it over."}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<LinkIcon />}
          onClick={() => setImporting({ mode: "url" })}
          sx={{ flex: { xs: 1, sm: "none" } }}
        >
          From a link
        </Button>
        {photoImport && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<PhotoCameraOutlinedIcon />}
            onClick={() => setImporting({ mode: "photo" })}
            sx={{ flex: { xs: 1, sm: "none" } }}
          >
            From photos
          </Button>
        )}
      </Stack>
    </Stack>
  );

  const titleField = (
    <TextField
      variant="standard"
      fullWidth
      autoFocus={!item}
      placeholder={
        layout === "instructions" ? "What's in the box?" : item ? "Recipe name" : "Recipe name, or paste a link"
      }
      value={draft.title}
      onChange={(e) => set({ title: e.target.value })}
      // A recipe's web address pasted as the name of a new item is read as an import instead.
      onPaste={(e) => {
        if (item || draft.title.trim()) return;
        const text = e.clipboardData.getData("text").trim();
        if (/^https?:\/\/\S+$/i.test(text)) {
          e.preventDefault();
          setImporting({ mode: "url", url: text });
        }
      }}
      sx={quietInput}
      slotProps={{ htmlInput: { maxLength: 120, "aria-label": "Title", style: { fontSize: 26, fontWeight: 800 } } }}
    />
  );

  const sourceChips = (draft.source_url || importedImage) && (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
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
  );

  const pickers = (
    <CategoryBookFields
      draft={draft}
      set={set}
      categories={categories}
      books={item ? [] : editableBooks}
      bookId={bookId}
      onBook={setBookId}
      stacked={wide}
    />
  );

  const photoStrip = (
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
      wrap={wide}
    />
  );

  const mainFields =
    layout === "recipe" ? (
      <RecipeFields draft={draft} set={set} accent={accent} />
    ) : (
      <InstructionFields draft={draft} set={set} accent={accent} />
    );

  const extraFields = <ExtraFields draft={draft} set={set} shown={shown} hidden={hidden} onOpen={openExtra} />;

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      fullScreen={phone}
      fullWidth
      maxWidth={wide ? "lg" : layout === "recipe" ? "md" : "sm"}
      // Desktop: a fixed height, so each pane scrolls on its own rather than the whole dialog.
      slotProps={wide ? { paper: { sx: { height: "min(880px, 92vh)" } } } : undefined}
    >
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
            {heading}
          </Typography>
          {!phone && (
            <Typography variant="caption" color="text.secondary">
              {status}
            </Typography>
          )}
          {/* On phones Save lives in the bottom bar, under the thumb. */}
          {!phone && (
            <Button variant="contained" onClick={save} disabled={!canSave} startIcon={saveIcon}>
              {saving ? "Saving" : "Save"}
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {wide ? (
        <DialogContent
          sx={{
            p: 0,
            display: "grid",
            gridTemplateColumns: "300px minmax(0, 1fr)",
            overflow: "hidden",
          }}
        >
          {/* Sidebar: the same details, in the same order, as the top of the phone editor */}
          <Box
            component="aside"
            sx={{ overflowY: "auto", p: 2.5, borderRight: "1px solid", borderColor: "divider", minHeight: 0 }}
          >
            <Stack spacing={2}>
              {sourceChips}
              {pickers}
              <QuickFacts draft={draft} set={set} layout={layout} stacked />
              {photoStrip}
            </Stack>
            <SectionTitle>More details</SectionTitle>
            {extraFields}
          </Box>
          {/* Main: the title, then what goes in and how to make it */}
          <Box sx={{ overflowY: "auto", px: 4, pt: 2.5, pb: 4, minHeight: 0 }}>
            {importBanner}
            {titleField}
            {mainFields}
          </Box>
        </DialogContent>
      ) : (
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2, pb: 4 }}>
          {importBanner}
          {titleField}
          {sourceChips && <Box sx={{ mt: 1.5 }}>{sourceChips}</Box>}
          <Box sx={{ mt: 1.5 }}>{pickers}</Box>
          {/* Quick facts, right under the title */}
          <Box sx={{ mt: 2.5 }}>
            <QuickFacts draft={draft} set={set} layout={layout} />
          </Box>
          <Box sx={{ mt: 2 }}>{photoStrip}</Box>
          {mainFields}
          {/* Optional details */}
          <SectionTitle>More details</SectionTitle>
          {extraFields}
        </DialogContent>
      )}
      {phone && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {status}
          </Typography>
          <Button variant="contained" onClick={save} disabled={!canSave} startIcon={saveIcon}>
            {saveLabel}
          </Button>
        </Stack>
      )}
      <ImportDialog
        open={!!importing}
        mode={importing?.mode}
        initialUrl={importing?.url}
        onClose={() => setImporting(null)}
        onImported={applyImport}
      />
    </Dialog>
  );
}
