import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppBar, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, InputAdornment, ListSubheader, Menu, MenuItem, Stack, TextField,
  Toolbar, Tooltip, Typography, useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import StarIcon from "@mui/icons-material/Star";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import TitleIcon from "@mui/icons-material/Title";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import {
  COOK_METHODS, COOK_METHOD_LABELS, MAX_KITCHEN_IMAGES, ingredientLine, normalizeTag, parseIngredientBlock, parseIngredientLine,
  type CookMethod, type KitchenLayout,
} from "../../../../../shared/xenkitchen/kitchen";
import {
  canEditBook, useCreateKitchenItem, useDeleteKitchenImage, useIngredientSuggestions, useKitchenBooks, useKitchenCategories,
  useKitchenTags, useUpdateKitchenItem, useUploadKitchenImages,
  type KitchenItem, type KitchenItemInput, type KitchenMethod,
} from "../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView, MethodIconView } from "./kitchenIcons";

// ---------- draft shape ----------

/**
 * An ingredient is edited as one line ("1½ cups flour, sifted") and split into
 * quantity/unit/name/note on save. `parsed` keeps the stored fields of an untouched line, so
 * opening and saving an item never re-parses (and so never reshuffles) what was there.
 */
type IngredientRow =
  | { key: string; kind: "section"; name: string }
  | { key: string; kind: "ingredient"; _id?: string; text: string; original?: string; parsed?: Parsed };

interface Parsed { quantity: string; unit: string; name: string; note: string }

interface StepRow { key: string; _id?: string; text: string; timer: string }
interface MethodRow extends Omit<KitchenMethod, "temp" | "minutes_min" | "minutes_max" | "steps"> {
  key: string; temp: string; minutes_min: string; minutes_max: string; stepsText: string;
}

interface Draft {
  title: string;
  description: string;
  category_id: string | null;
  tags: string[];
  notes: string;
  servings: string;
  prep_minutes: string;
  cook_minutes: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
  brand: string;
  methods: MethodRow[];
  storage_note: string;
}

let keySeq = 0;
const newKey = () => `k${++keySeq}`;
const numStr = (n: number | null | undefined) => (n || n === 0 ? String(n) : "");
const strNum = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};


function parseRow(row: Extract<IngredientRow, { kind: "ingredient" }>): Parsed | null {
  if (row.parsed && row.text === row.original) return row.parsed;
  const p = parseIngredientLine(row.text);
  return p && (p.name || p.quantity) ? p : null;
}

const blankIngredient = (): IngredientRow => ({ key: newKey(), kind: "ingredient", text: "" });
const blankStep = (): StepRow => ({ key: newKey(), text: "", timer: "" });
const blankMethod = (method: CookMethod = "oven"): MethodRow => ({
  key: newKey(), method, temp: "", temp_unit: "F", power: "", minutes_min: "", minutes_max: "", preheat: method === "oven", stepsText: "",
});

function draftFrom(item: KitchenItem | null | undefined, categoryId: string | null): Draft {
  if (!item) {
    return {
      title: "", description: "", category_id: categoryId, tags: [], notes: "", servings: "", prep_minutes: "", cook_minutes: "",
      ingredients: [blankIngredient()], steps: [blankStep()], brand: "", methods: [blankMethod()], storage_note: "",
    };
  }
  const ingredients: IngredientRow[] = [];
  let section = "";
  for (const ing of item.ingredients) {
    if ((ing.section || "") !== section) {
      section = ing.section || "";
      if (section) ingredients.push({ key: newKey(), kind: "section", name: section });
    }
    const parsed = { quantity: ing.quantity, unit: ing.unit, name: ing.name, note: ing.note };
    const text = ingredientLine(parsed);
    ingredients.push({ key: newKey(), kind: "ingredient", _id: ing._id, text, original: text, parsed });
  }
  return {
    title: item.title,
    description: item.description,
    category_id: item.category_id ?? null,
    tags: item.tags,
    notes: item.notes,
    servings: numStr(item.servings),
    prep_minutes: numStr(item.prep_minutes),
    cook_minutes: numStr(item.cook_minutes),
    ingredients: ingredients.length ? ingredients : [blankIngredient()],
    steps: item.steps.length ? item.steps.map((s) => ({ key: newKey(), _id: s._id, text: s.text, timer: numStr(s.timer_minutes) })) : [blankStep()],
    brand: item.brand,
    methods: item.methods.length
      ? item.methods.map((m) => ({
        ...m, key: newKey(), temp: numStr(m.temp), minutes_min: numStr(m.minutes_min), minutes_max: numStr(m.minutes_max), stepsText: m.steps.join("\n"),
      }))
      : [blankMethod()],
    storage_note: item.storage_note,
  };
}

function inputFrom(d: Draft): KitchenItemInput {
  let section = "";
  const ingredients: KitchenItemInput["ingredients"] = [];
  for (const row of d.ingredients) {
    if (row.kind === "section") { section = row.name.trim(); continue; }
    const p = parseRow(row);
    if (!p) continue;
    ingredients.push({ ...(row._id ? { _id: row._id } : {}), ...p, section });
  }
  return {
    title: d.title.trim() || "Untitled",
    description: d.description,
    category_id: d.category_id,
    tags: d.tags,
    notes: d.notes,
    servings: strNum(d.servings),
    prep_minutes: strNum(d.prep_minutes),
    cook_minutes: strNum(d.cook_minutes),
    ingredients,
    steps: d.steps.filter((s) => s.text.trim()).map((s) => ({ ...(s._id ? { _id: s._id } : {}), text: s.text, timer_minutes: strNum(s.timer) })),
    brand: d.brand,
    methods: d.methods
      .filter((m) => m.temp || m.minutes_min || m.minutes_max || m.power || m.stepsText.trim())
      .map(({ key: _k, stepsText, ...m }) => ({
        ...m,
        temp: strNum(m.temp),
        minutes_min: strNum(m.minutes_min),
        minutes_max: strNum(m.minutes_max),
        steps: stepsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      })),
    storage_note: d.storage_note,
  };
}

function moveIn<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Optional fields, hidden behind "+ …" chips until used.
type Extra = "description" | "tags" | "times" | "brand" | "storage" | "notes";
const EXTRA_LABELS: Record<Extra, string> = {
  description: "Description", tags: "Tags", times: "Servings & time", brand: "Brand", storage: "Storage", notes: "Notes",
};
const EXTRAS_FOR: Record<KitchenLayout, Extra[]> = {
  recipe: ["description", "times", "tags", "notes"],
  instructions: ["brand", "storage", "description", "tags", "notes"],
};
function filledExtras(d: Draft): Set<Extra> {
  const s = new Set<Extra>();
  if (d.description.trim()) s.add("description");
  if (d.tags.length) s.add("tags");
  if (d.servings || d.prep_minutes || d.cook_minutes) s.add("times");
  if (d.brand.trim()) s.add("brand");
  if (d.storage_note.trim()) s.add("storage");
  if (d.notes.trim()) s.add("notes");
  return s;
}

// Borderless, roomy inputs: the editor reads like a page, not a form.
const quietInput = {
  "& .MuiInput-underline:before": { borderBottomColor: "transparent" },
  "& .MuiInput-underline:hover:not(.Mui-disabled):before": { borderBottomColor: "divider" },
} as const;

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

export default function ItemEditor({ open, onClose, item, defaultCategoryId = null, defaultBookId = null, onSaved }: ItemEditorProps) {
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
  const deleteImage = useDeleteKitchenImage();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(item, defaultCategoryId));
  const initial = useRef("");
  // Existing photos, in display order, minus any removed in this session.
  const [photos, setPhotos] = useState<KitchenItem["images"]>([]);
  const [newFiles, setNewFiles] = useState<Array<{ key: string; file: File; url: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<Set<Extra>>(new Set());

  useEffect(() => {
    if (!open) return;
    const d = draftFrom(item, defaultCategoryId);
    setDraft(d);
    setOpened(filledExtras(d));
    initial.current = JSON.stringify(inputFrom(d));
    setPhotos(item?.images ?? []);
    setNewFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?._id]);

  useEffect(() => () => newFiles.forEach((f) => URL.revokeObjectURL(f.url)), [newFiles]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const category = categories.find((c) => c._id === draft.category_id);
  const layout: KitchenLayout = category?.layout ?? "recipe";
  const accent = category?.color ?? theme.palette.primary.main;

  const dirty = JSON.stringify(inputFrom(draft)) !== initial.current
    || newFiles.length > 0
    || photos.map((p) => p._id).join() !== (item?.images ?? []).map((p) => p._id).join();

  const requestClose = async () => {
    if (saving) return;
    if (dirty && !(await confirm({ title: "Discard changes?", message: "Your edits haven't been saved.", confirmLabel: "Discard", destructive: false }))) return;
    onClose();
  };

  const totalPhotos = photos.length + newFiles.length;
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_KITCHEN_IMAGES - totalPhotos;
    const picked = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, room);
    if (files.length > room) enqueueSnackbar(`Up to ${MAX_KITCHEN_IMAGES} photos per item`, { variant: "info" });
    setNewFiles((prev) => [...prev, ...picked.map((file) => ({ key: newKey(), file, url: URL.createObjectURL(file) }))]);
  };

  const save = async () => {
    setSaving(true);
    const input = inputFrom(draft);
    try {
      let saved: KitchenItem;
      if (item) {
        const removed = item.images.filter((img) => !photos.some((p) => p._id === img._id));
        for (const img of removed) await deleteImage.mutateAsync({ id: item._id, imageId: img._id });
        saved = (await update.mutateAsync({ id: item._id, patch: { ...input, image_order: photos.map((p) => p._id) } })).item;
      } else {
        saved = (await create.mutateAsync({ ...input, book_id: bookId })).item;
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
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar sx={{ gap: 1 }} variant="dense">
          <IconButton edge="start" onClick={requestClose} aria-label="Close"><CloseIcon /></IconButton>
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }} noWrap>{item ? "Edit" : "New"}</Typography>
          <Button variant="contained" onClick={save} disabled={!canSave}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
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
                    <CategoryIconView icon={c.icon} sx={{ fontSize: 18, color: c.color, mr: 1.5 }} />{c.name}
                  </MenuItem>
                )),
              ];
            })}
            <MenuItem value="">No category</MenuItem>
          </TextField>

          {!item && editableBooks.length > 1 && (
            <TextField select size="small" value={bookId} sx={{ minWidth: 160 }}
              onChange={(e) => { setBookId(e.target.value); set({ category_id: null }); }}
              slotProps={{ htmlInput: { "aria-label": "Recipe book" } }}>
              {editableBooks.map((b) => (
                <MenuItem key={b._id} value={b._id}>
                  <CategoryIconView icon={b.icon} sx={{ fontSize: 18, color: b.color, mr: 1, verticalAlign: "middle" }} />
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
                  return <TextField key={e} label="Description" value={draft.description} onChange={(ev) => set({ description: ev.target.value })}
                    fullWidth multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />;
                case "tags":
                  return <TagField key={e} value={draft.tags} onChange={(tags) => set({ tags })} />;
                case "times":
                  return (
                    <Stack key={e} direction="row" spacing={1.5}>
                      <TextField label="Serves" type="number" size="small" value={draft.servings} onChange={(ev) => set({ servings: ev.target.value })} fullWidth
                        slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }} />
                      <TextField label="Prep" type="number" size="small" value={draft.prep_minutes} onChange={(ev) => set({ prep_minutes: ev.target.value })} fullWidth
                        slotProps={{ htmlInput: { min: 0, inputMode: "numeric" }, input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
                      <TextField label="Cook" type="number" size="small" value={draft.cook_minutes} onChange={(ev) => set({ cook_minutes: ev.target.value })} fullWidth
                        slotProps={{ htmlInput: { min: 0, inputMode: "numeric" }, input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
                    </Stack>
                  );
                case "brand":
                  return <TextField key={e} label="Brand" size="small" value={draft.brand} onChange={(ev) => set({ brand: ev.target.value })}
                    fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />;
                case "storage":
                  return <TextField key={e} label="Storage" size="small" value={draft.storage_note} onChange={(ev) => set({ storage_note: ev.target.value })}
                    fullWidth multiline placeholder="Keep frozen. Do not refreeze." slotProps={{ htmlInput: { maxLength: 500 } }} />;
                case "notes":
                  return <TextField key={e} label="Notes" value={draft.notes} onChange={(ev) => set({ notes: ev.target.value })}
                    fullWidth multiline minRows={2} slotProps={{ htmlInput: { maxLength: 4000 } }} />;
              }
            })}
          </Stack>
        )}
        {hidden.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 3 }}>
            {hidden.map((e) => (
              <Chip key={e} icon={<AddIcon />} label={EXTRA_LABELS[e]} variant="outlined" onClick={() => openExtra(e)} />
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- photos ----------

function PhotoStrip({ photos, newFiles, accent, canAdd, onAdd, onRemovePhoto, onCoverPhoto, onRemoveNew, hint }: {
  photos: KitchenItem["images"];
  newFiles: Array<{ key: string; url: string }>;
  accent: string;
  canAdd: boolean;
  onAdd: (files: FileList | null) => void;
  onRemovePhoto: (id: string) => void;
  onCoverPhoto: (id: string) => void;
  onRemoveNew: (key: string) => void;
  hint: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const all = [
    ...photos.map((p) => ({ key: p._id, url: p.url, existing: true })),
    ...newFiles.map((f) => ({ key: f.key, url: f.url, existing: false })),
  ];

  const tile = { width: 88, height: 88, borderRadius: 2, flexShrink: 0 } as const;

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onAdd(e.dataTransfer.files); }}
      sx={{ borderRadius: 3, outline: dragOver ? `2px dashed ${accent}` : "none", outlineOffset: 4 }}
    >
      <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 1 }}>
        {all.map((p, i) => (
          <Box key={p.key} sx={{ ...tile, position: "relative" }}>
            <Box component="img" src={p.url} alt="" sx={{ ...tile, objectFit: "cover", display: "block" }} />
            {i === 0 && (
              <Chip size="small" icon={<StarIcon sx={{ fontSize: 14 }} />} label="Cover"
                sx={{ position: "absolute", left: 4, bottom: 4, height: 22, bgcolor: "rgba(0,0,0,0.6)", color: "common.white", "& .MuiChip-icon": { color: "warning.light" } }} />
            )}
            {!p.existing && (
              <Chip size="small" label="New" sx={{ position: "absolute", left: 4, top: 4, height: 20, bgcolor: accent, color: "common.white" }} />
            )}
            <Stack direction="row" sx={{ position: "absolute", right: 2, top: 2 }}>
              {p.existing && i !== 0 && (
                <Tooltip title="Make cover">
                  <IconButton size="small" onClick={() => onCoverPhoto(p.key)} sx={{ bgcolor: "rgba(0,0,0,0.5)", color: "common.white", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" }, mr: 0.5 }}>
                    <StarIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove">
                <IconButton size="small" onClick={() => (p.existing ? onRemovePhoto(p.key) : onRemoveNew(p.key))}
                  sx={{ bgcolor: "rgba(0,0,0,0.5)", color: "common.white", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" } }}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ))}
        {canAdd && (
          <>
            <Box role="button" onClick={() => fileInput.current?.click()} sx={{
              ...tile, border: "2px dashed", borderColor: "divider", cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 0.5, color: "text.secondary", textAlign: "center", px: 1,
              "&:hover": { borderColor: accent, color: accent },
            }}>
              <AddPhotoAlternateIcon />
              <Typography variant="caption">{all.length ? "Add more" : hint}</Typography>
            </Box>
            <Box role="button" onClick={() => cameraInput.current?.click()} sx={{
              ...tile, border: "2px dashed", borderColor: "divider", cursor: "pointer", display: { xs: "flex", md: "none" },
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, color: "text.secondary",
              "&:hover": { borderColor: accent, color: accent },
            }}>
              <PhotoCameraIcon />
              <Typography variant="caption">Camera</Typography>
            </Box>
          </>
        )}
      </Box>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
    </Box>
  );
}

function PasteDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (rows: ReturnType<typeof parseIngredientBlock>) => void }) {
  const [text, setText] = useState("");
  const parsed = parseIngredientBlock(text);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Paste ingredients</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>One per line. Quantities and units are split out for you.</Typography>
        <TextField multiline minRows={6} fullWidth autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"2 cups flour\n1 tsp salt\n3 eggs, beaten"} />
        {parsed.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.5 }}>Preview</Typography>
            {parsed.slice(0, 8).map((p, i) => (
              <Typography key={i} variant="body2">
                <b>{[p.quantity, p.unit].filter(Boolean).join(" ")}</b> {p.name}{p.note && <span style={{ opacity: 0.6 }}>, {p.note}</span>}
              </Typography>
            ))}
            {parsed.length > 8 && <Typography variant="caption" color="text.secondary">…and {parsed.length - 8} more</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!parsed.length} onClick={() => { onAdd(parsed); setText(""); onClose(); }}>
          Add {parsed.length || ""}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


// ---------- tags ----------

function TagField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { tags } = useKitchenTags();
  const [input, setInput] = useState("");
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={tags.map((t) => t.tag).filter((t) => !value.includes(t))}
      value={value}
      inputValue={input}
      onInputChange={(_, v) => {
        // A comma finishes a tag, like most tag inputs.
        if (v.endsWith(",")) {
          const t = normalizeTag(v.slice(0, -1));
          if (t && !value.includes(t)) onChange([...value, t]);
          setInput("");
        } else setInput(v);
      }}
      onChange={(_, v) => onChange([...new Set((v as string[]).map(normalizeTag).filter(Boolean))])}
      renderInput={(p) => <TextField {...p} label="Tags" placeholder={value.length ? "" : "quick, vegetarian…"} />}
    />
  );
}

// ---------- recipe fields ----------

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 3, mb: 0.5 }}>
      <Typography variant="caption" sx={{ ...sectionLabelSx, color: "text.secondary" }}>{children}</Typography>
      {action}
    </Stack>
  );
}

function RecipeFields({ draft, set, accent }: { draft: Draft; set: (p: Partial<Draft>) => void; accent: string }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [menu, setMenu] = useState<{ el: HTMLElement; i: number } | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const rows = draft.ingredients;
  const setRows = (ingredients: IngredientRow[]) => set({ ingredients });
  const patchRow = (i: number, patch: Partial<IngredientRow>) =>
    setRows(rows.map((r, j) => (j === i ? ({ ...r, ...patch } as IngredientRow) : r)));

  const insertAfter = (i: number) => {
    const row = blankIngredient();
    setRows([...rows.slice(0, i + 1), row, ...rows.slice(i + 1)]);
    setFocusKey(row.key);
  };
  const removeAt = (i: number) => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blankIngredient()]);

  return (
    <>
      <SectionTitle action={
        <Button size="small" color="inherit" startIcon={<ContentPasteIcon fontSize="small" />} onClick={() => setPasteOpen(true)} sx={{ opacity: 0.7 }}>
          Paste list
        </Button>
      }>
        Ingredients
      </SectionTitle>
      <Stack spacing={0.25}>
        {rows.map((row, i) => row.kind === "section" ? (
          <Stack key={row.key} direction="row" alignItems="center" sx={{ pt: i ? 1 : 0 }}>
            <TextField variant="standard" placeholder="Section, e.g. Sauce" value={row.name} fullWidth
              onChange={(e) => patchRow(i, { name: e.target.value })} sx={quietInput}
              slotProps={{ htmlInput: { maxLength: 60, style: { fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13 } } }} />
            <IconButton size="small" onClick={() => removeAt(i)} aria-label="Remove section"><CloseIcon fontSize="small" /></IconButton>
          </Stack>
        ) : (
          <Stack key={row.key} direction="row" alignItems="center" spacing={1}
            sx={{ "& .row-more": { opacity: { sm: 0 } }, "&:hover .row-more, &:focus-within .row-more": { opacity: 1 } }}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: accent, flexShrink: 0, opacity: 0.7 }} />
            <IngredientLineField
              value={row.text}
              autoFocus={focusKey === row.key}
              onChange={(text) => patchRow(i, { text })}
              onEnter={() => insertAfter(i)}
              onBackspaceEmpty={() => { if (rows.length > 1) removeAt(i); }}
            />
            <IconButton className="row-more" size="small" onClick={(e) => setMenu({ el: e.currentTarget, i })} aria-label="Ingredient options">
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <Button size="small" startIcon={<AddIcon />} onClick={() => insertAfter(rows.length - 1)}>Ingredient</Button>
        <Button size="small" color="inherit" startIcon={<TitleIcon />} sx={{ opacity: 0.7 }}
          onClick={() => { const row = blankIngredient(); setRows([...rows, { key: newKey(), kind: "section", name: "" }, row]); }}>
          Section
        </Button>
      </Stack>
      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem disabled={!menu || menu.i === 0} onClick={() => { if (menu) setRows(moveIn(rows, menu.i, -1)); setMenu(null); }}>
          <ArrowUpwardIcon fontSize="small" sx={{ mr: 1 }} />Move up
        </MenuItem>
        <MenuItem disabled={!menu || menu.i === rows.length - 1} onClick={() => { if (menu) setRows(moveIn(rows, menu.i, 1)); setMenu(null); }}>
          <ArrowDownwardIcon fontSize="small" sx={{ mr: 1 }} />Move down
        </MenuItem>
        <MenuItem onClick={() => { if (menu) removeAt(menu.i); setMenu(null); }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Remove
        </MenuItem>
      </Menu>
      <PasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onAdd={(parsed) => {
        const kept = rows.filter((r) => r.kind === "section" || r.text.trim());
        setRows([...kept, ...parsed.map((p) => ({ key: newKey(), kind: "ingredient" as const, text: ingredientLine(p) }))]);
      }} />

      <StepsEditor steps={draft.steps} onChange={(steps) => set({ steps })} accent={accent} />
    </>
  );
}

/**
 * One line per ingredient. Suggestions come from the name part of what's typed
 * ("2 cups gar" → garlic), and picking one keeps the amount and fills the usual unit.
 */
function IngredientLineField({ value, onChange, onEnter, onBackspaceEmpty, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const parsed = useMemo(() => parseIngredientLine(value) ?? { quantity: "", unit: "", name: "", note: "" }, [value]);
  const nameQuery = parsed.note ? "" : parsed.name.trim();
  // A word the parser doesn't know as a unit ("2 handfuls spinach") ends up in the name, so
  // also look up the name without its first word and offer those matches after the exact ones.
  const tailQuery = nameQuery.includes(" ") ? nameQuery.slice(nameQuery.indexOf(" ") + 1) : "";
  const { suggestions } = useIngredientSuggestions(nameQuery, focused && nameQuery.length > 0);
  const { suggestions: tailSuggestions } = useIngredientSuggestions(tailQuery, focused && tailQuery.length > 1);
  const options = useMemo(() => {
    const pick = (list: typeof suggestions, q: string) => {
      const lq = q.toLowerCase();
      return lq ? list.filter((s) => { const n = s.name.toLowerCase(); return n.includes(lq) && n !== lq; }) : [];
    };
    const seen = new Set<string>();
    return [...pick(suggestions, nameQuery), ...pick(tailSuggestions, tailQuery)]
      .filter((s) => { const k = s.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 8);
  }, [suggestions, tailSuggestions, nameQuery, tailQuery]);

  return (
    <Autocomplete
      freeSolo
      fullWidth
      size="small"
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
      inputValue={value}
      onInputChange={(_, v, reason) => { if (reason === "input" || reason === "clear") onChange(v); }}
      onChange={(_, v) => {
        if (v && typeof v !== "string") {
          // Matched on the tail ("handfuls spin" → spinach): the first word was really a unit.
          const viaTail = tailQuery && !v.name.toLowerCase().includes(nameQuery.toLowerCase());
          const lead = viaTail ? nameQuery.slice(0, nameQuery.indexOf(" ")) : "";
          onChange(ingredientLine({ quantity: parsed.quantity, unit: parsed.unit || lead || v.unit, name: v.name, note: parsed.note }));
        }
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      renderOption={(props, o) => {
        const { key, ...rest } = props as any;
        return (
          <li key={key} {...rest}>
            <Stack direction="row" justifyContent="space-between" sx={{ width: "100%" }}>
              <span>{o.name}</span>
              <Typography variant="caption" color="text.secondary">{o.unit}</Typography>
            </Stack>
          </li>
        );
      }}
      renderInput={(p) => (
        <TextField {...p} variant="standard" autoFocus={autoFocus} placeholder="e.g. 2 cups flour, sifted" sx={quietInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.defaultPrevented && !(p.inputProps as any)["aria-activedescendant"]) { e.preventDefault(); onEnter(); }
            if (e.key === "Backspace" && !value) { e.preventDefault(); onBackspaceEmpty(); }
          }}
          slotProps={{ htmlInput: { ...p.inputProps, maxLength: 200, "aria-label": "Ingredient" } }} />
      )}
    />
  );
}

function StepsEditor({ steps, onChange, accent }: { steps: StepRow[]; onChange: (s: StepRow[]) => void; accent: string }) {
  const patch = (i: number, p: Partial<StepRow>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const [timerFor, setTimerFor] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const insertAfter = (i: number) => {
    const row = blankStep();
    onChange([...steps.slice(0, i + 1), row, ...steps.slice(i + 1)]);
    setFocusKey(row.key);
  };

  return (
    <>
      <SectionTitle>Steps</SectionTitle>
      <Stack spacing={1}>
        {steps.map((s, i) => (
          <Stack key={s.key} direction="row" spacing={1.5} alignItems="flex-start"
            sx={{ "& .row-more": { opacity: { sm: 0 } }, "&:hover .row-more, &:focus-within .row-more": { opacity: 1 } }}>
            <Box sx={{
              width: 24, height: 24, mt: 0.5, borderRadius: "50%", bgcolor: alpha(accent, 0.18), fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {i + 1}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TextField multiline fullWidth variant="standard" placeholder={i === 0 ? "First, …" : "Then…"} value={s.text}
                autoFocus={focusKey === s.key}
                onChange={(e) => patch(i, { text: e.target.value })} sx={quietInput}
                onKeyDown={(e) => {
                  // Enter starts the next step; Shift+Enter is a line break inside this one.
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); insertAfter(i); }
                  if (e.key === "Backspace" && !s.text && steps.length > 1) { e.preventDefault(); onChange(steps.filter((_, j) => j !== i)); }
                }}
                slotProps={{ htmlInput: { maxLength: 2000, "aria-label": `Step ${i + 1}` } }} />
              {(s.timer || timerFor.has(s.key)) && (
                <TextField size="small" type="number" placeholder="Timer" value={s.timer} onChange={(e) => patch(i, { timer: e.target.value })}
                  sx={{ mt: 0.5, width: 130 }} autoFocus={!s.timer}
                  slotProps={{ htmlInput: { min: 0, "aria-label": "Timer minutes" }, input: {
                    startAdornment: <InputAdornment position="start"><TimerOutlinedIcon fontSize="small" /></InputAdornment>,
                    endAdornment: <InputAdornment position="end">min</InputAdornment>,
                  } }} />
              )}
            </Box>
            <Stack direction="row" className="row-more">
              {!s.timer && !timerFor.has(s.key) && (
                <Tooltip title="Add a timer">
                  <IconButton size="small" onClick={() => setTimerFor((t) => new Set(t).add(s.key))}><TimerOutlinedIcon fontSize="small" /></IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove step">
                <IconButton size="small" onClick={() => onChange(steps.length > 1 ? steps.filter((_, j) => j !== i) : [blankStep()])}><CloseIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} sx={{ mt: 0.5 }} onClick={() => insertAfter(steps.length - 1)}>Step</Button>
    </>
  );
}

// ---------- box instructions fields ----------

function InstructionFields({ draft, set, accent }: { draft: Draft; set: (p: Partial<Draft>) => void; accent: string }) {
  const methods = draft.methods;
  const patch = (i: number, p: Partial<MethodRow>) => set({ methods: methods.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const used = new Set(methods.map((m) => m.method));
  const nextMethod = COOK_METHODS.find((m) => !used.has(m)) ?? "other";
  const [stepsOpen, setStepsOpen] = useState<Set<string>>(new Set());

  return (
    <>
      <SectionTitle>How to cook it</SectionTitle>
      <Stack spacing={1.5}>
        {methods.map((m, i) => {
          const showSteps = !!m.stepsText.trim() || stepsOpen.has(m.key);
          return (
            <Box key={m.key} sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(accent, 0.07), border: "1px solid", borderColor: alpha(accent, 0.25) }}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <TextField select size="small" value={m.method} onChange={(e) => patch(i, { method: e.target.value as CookMethod, preheat: e.target.value === "oven" ? m.preheat : false })}
                  sx={{ minWidth: 150 }} slotProps={{ htmlInput: { "aria-label": "Method" }, select: { renderValue: (v) => (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MethodIconView method={v as CookMethod} sx={{ fontSize: 18, color: accent }} />
                      <span>{COOK_METHOD_LABELS[v as CookMethod]}</span>
                    </Stack>
                  ) } }}>
                  {COOK_METHODS.map((opt) => (
                    <MenuItem key={opt} value={opt}><MethodIconView method={opt} sx={{ fontSize: 18, mr: 1.5 }} />{COOK_METHOD_LABELS[opt]}</MenuItem>
                  ))}
                </TextField>

                {m.method === "microwave" ? (
                  <TextField size="small" placeholder="Power" value={m.power} onChange={(e) => patch(i, { power: e.target.value })}
                    sx={{ width: 110 }} slotProps={{ htmlInput: { maxLength: 30, "aria-label": "Power" } }} />
                ) : (
                  <TextField size="small" placeholder="Temp" type="number" value={m.temp} onChange={(e) => patch(i, { temp: e.target.value })}
                    sx={{ width: 120 }}
                    slotProps={{ htmlInput: { min: 0, inputMode: "numeric", "aria-label": "Temperature" }, input: { endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title="Switch °F / °C">
                          <Box component="button" type="button" onClick={() => patch(i, { temp_unit: m.temp_unit === "F" ? "C" : "F" })}
                            sx={{ border: 0, bgcolor: "transparent", color: "text.secondary", cursor: "pointer", font: "inherit", p: 0 }}>
                            °{m.temp_unit}
                          </Box>
                        </Tooltip>
                      </InputAdornment>
                    ) } }} />
                )}

                <Stack direction="row" spacing={0.5} alignItems="center">
                  <TextField size="small" placeholder="Min" type="number" value={m.minutes_min} onChange={(e) => patch(i, { minutes_min: e.target.value })}
                    sx={{ width: 72 }} slotProps={{ htmlInput: { min: 0, inputMode: "numeric", "aria-label": "Minutes from" } }} />
                  <Typography color="text.secondary">–</Typography>
                  <TextField size="small" placeholder="Max" type="number" value={m.minutes_max} onChange={(e) => patch(i, { minutes_max: e.target.value })}
                    sx={{ width: 72 }} slotProps={{ htmlInput: { min: 0, inputMode: "numeric", "aria-label": "Minutes to" } }} />
                  <Typography variant="body2" color="text.secondary">min</Typography>
                </Stack>

                {m.method !== "microwave" && (
                  <Chip size="small" label="Preheat" variant={m.preheat ? "filled" : "outlined"} color={m.preheat ? "warning" : "default"}
                    onClick={() => patch(i, { preheat: !m.preheat })} />
                )}
                <Box sx={{ flex: 1 }} />
                {!showSteps && (
                  <Button size="small" color="inherit" sx={{ opacity: 0.7 }} onClick={() => setStepsOpen((s) => new Set(s).add(m.key))}>+ Steps</Button>
                )}
                <IconButton size="small" aria-label="Remove method"
                  onClick={() => set({ methods: methods.length > 1 ? methods.filter((_, j) => j !== i) : [blankMethod()] })}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
              {showSteps && (
                <TextField sx={{ mt: 1.5 }} fullWidth multiline minRows={2} size="small" placeholder={"One per line, e.g.\nRemove film\nLet stand 2 minutes"}
                  value={m.stepsText} onChange={(e) => patch(i, { stepsText: e.target.value })} autoFocus={!m.stepsText}
                  slotProps={{ htmlInput: { "aria-label": "Steps" } }} />
              )}
            </Box>
          );
        })}
      </Stack>
      {methods.length < 6 && (
        <Button size="small" startIcon={<AddIcon />} sx={{ mt: 0.5 }} onClick={() => set({ methods: [...methods, blankMethod(nextMethod)] })}>
          Another way to cook it
        </Button>
      )}
    </>
  );
}
