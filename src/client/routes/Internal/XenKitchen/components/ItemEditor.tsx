import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppBar, Autocomplete, Box, Button, Card, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, InputAdornment, Menu, MenuItem, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography, useMediaQuery,
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
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { cardSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import {
  COOK_METHODS, COOK_METHOD_LABELS, MAX_KITCHEN_IMAGES, normalizeTag, parseIngredientBlock,
  type CookMethod, type KitchenLayout,
} from "../../../../../shared/xenkitchen/kitchen";
import {
  canEditBook, useCreateKitchenItem, useDeleteKitchenImage, useIngredientSuggestions, useKitchenBooks, useKitchenCategories,
  useKitchenTags, useUpdateKitchenItem, useUploadKitchenImages,
  type KitchenItem, type KitchenItemInput, type KitchenMethod,
} from "../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView, MethodIconView } from "./kitchenIcons";

// ---------- draft shape ----------

type IngredientRow =
  | { key: string; kind: "section"; name: string }
  | { key: string; kind: "ingredient"; _id?: string; name: string; quantity: string; unit: string; note: string };

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

const blankIngredient = (): IngredientRow => ({ key: newKey(), kind: "ingredient", name: "", quantity: "", unit: "", note: "" });
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
    ingredients.push({ key: newKey(), kind: "ingredient", _id: ing._id, name: ing.name, quantity: ing.quantity, unit: ing.unit, note: ing.note });
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
    if (!row.name.trim() && !row.quantity.trim()) continue;
    ingredients.push({ ...(row._id ? { _id: row._id } : {}), name: row.name, quantity: row.quantity, unit: row.unit, note: row.note, section });
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

  useEffect(() => {
    if (!open) return;
    const d = draftFrom(item, defaultCategoryId);
    setDraft(d);
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

  return (
    <Dialog open={open} onClose={requestClose} fullScreen={phone} fullWidth maxWidth="md"
      slotProps={{ paper: { sx: { borderRadius: phone ? 0 : 3 } } }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={requestClose} aria-label="Close"><CloseIcon /></IconButton>
          <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }} noWrap>{item ? "Edit" : "New"}</Typography>
          <Button variant="contained" onClick={save} disabled={!canSave}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? "Saving" : "Save"}
          </Button>
        </Toolbar>
      </AppBar>

      <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
        <Stack spacing={3}>
          {/* Book (new items only; existing ones move from the item menu) */}
          {!item && editableBooks.length > 1 && (
            <TextField select label="Recipe book" value={bookId} size="small"
              onChange={(e) => { setBookId(e.target.value); set({ category_id: null }); }} sx={{ maxWidth: 320 }}>
              {editableBooks.map((b) => (
                <MenuItem key={b._id} value={b._id}>
                  <CategoryIconView icon={b.icon} sx={{ fontSize: 18, color: b.color, mr: 1, verticalAlign: "middle" }} />
                  {b.name}{b.members.length > 1 ? ` · shared with ${b.members.length - 1}` : ""}
                </MenuItem>
              ))}
            </TextField>
          )}

          {/* Category */}
          <Box>
            {(["recipe", "instructions"] as KitchenLayout[]).map((group) => {
              const list = categories.filter((c) => c.layout === group);
              if (!list.length) return null;
              return (
            <Box key={group} sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>{group === "recipe" ? "Recipe category" : "Instructions"}</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {list.map((c) => {
                const active = c._id === draft.category_id;
                return (
                  <Chip
                    key={c._id}
                    icon={<CategoryIconView icon={c.icon} sx={{ fontSize: 18 }} />}
                    label={c.name}
                    onClick={() => set({ category_id: active ? null : c._id })}
                    sx={{
                      fontWeight: 600, border: "1px solid", borderColor: active ? c.color : "divider",
                      bgcolor: active ? alpha(c.color, 0.2) : "transparent", "& .MuiChip-icon": { color: c.color },
                    }}
                  />
                );
              })}
            </Box>
            </Box>
              );
            })}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {layout === "instructions"
                ? "Instructions: brand, cooking directions and storage. Snap the box, add the temps, toss the box."
                : "Recipe: servings, times, ingredients and steps."}
            </Typography>
          </Box>

          {/* Photos */}
          <PhotoStrip
            photos={photos}
            newFiles={newFiles}
            accent={accent}
            canAdd={totalPhotos < MAX_KITCHEN_IMAGES}
            onAdd={addFiles}
            onRemovePhoto={(id) => setPhotos((p) => p.filter((x) => x._id !== id))}
            onCoverPhoto={(id) => setPhotos((p) => [...p.filter((x) => x._id === id), ...p.filter((x) => x._id !== id)])}
            onRemoveNew={(key) => setNewFiles((f) => f.filter((x) => x.key !== key))}
            hint={layout === "instructions" ? "Take a photo of the box's cooking directions" : "Add a photo of the finished dish"}
          />

          {/* Basics */}
          <Stack spacing={2}>
            <TextField label="Title" value={draft.title} onChange={(e) => set({ title: e.target.value })} fullWidth autoFocus={!item}
              placeholder={layout === "instructions" ? "e.g. Pepperoni pizza" : "e.g. Weeknight chicken curry"}
              slotProps={{ htmlInput: { maxLength: 120 } }}
              helperText={!draft.title.trim() && totalPhotos > 0 ? "No title yet — it'll save as \"Untitled\" so you can finish it later." : undefined} />
            {layout === "instructions" && (
              <TextField label="Brand" value={draft.brand} onChange={(e) => set({ brand: e.target.value })} fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
            )}
            <TextField label="Description" value={draft.description} onChange={(e) => set({ description: e.target.value })} fullWidth multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
            <TagField value={draft.tags} onChange={(tags) => set({ tags })} />
          </Stack>

          {layout === "recipe" ? (
            <RecipeFields draft={draft} set={set} />
          ) : (
            <InstructionFields draft={draft} set={set} accent={accent} />
          )}

          <TextField label="Notes" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} fullWidth multiline minRows={2}
            placeholder="Tweaks, where you found it, what to serve it with…" slotProps={{ htmlInput: { maxLength: 4000 } }} />
        </Stack>
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

  const tile = { width: 120, height: 120, borderRadius: 2, flexShrink: 0 } as const;

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onAdd(e.dataTransfer.files); }}
      sx={{ borderRadius: 3, outline: dragOver ? `2px dashed ${accent}` : "none", outlineOffset: 4 }}
    >
      <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Photos</Typography>
      <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 1 }}>
        {all.map((p, i) => (
          <Box key={p.key} sx={{ ...tile, position: "relative" }}>
            <Box component="img" src={p.url} alt="" sx={{ ...tile, objectFit: "cover", display: "block" }} />
            {i === 0 && (
              <Chip size="small" icon={<StarIcon sx={{ fontSize: 14 }} />} label="Cover"
                sx={{ position: "absolute", left: 4, bottom: 4, height: 22, bgcolor: "rgba(0,0,0,0.6)", color: "#fff", "& .MuiChip-icon": { color: "#ffd54f" } }} />
            )}
            {!p.existing && (
              <Chip size="small" label="New" sx={{ position: "absolute", left: 4, top: 4, height: 20, bgcolor: accent, color: "#fff" }} />
            )}
            <Stack direction="row" sx={{ position: "absolute", right: 2, top: 2 }}>
              {p.existing && i !== 0 && (
                <Tooltip title="Make cover">
                  <IconButton size="small" onClick={() => onCoverPhoto(p.key)} sx={{ bgcolor: "rgba(0,0,0,0.5)", color: "#fff", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" }, mr: 0.5 }}>
                    <StarIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove">
                <IconButton size="small" onClick={() => (p.existing ? onRemovePhoto(p.key) : onRemoveNew(p.key))}
                  sx={{ bgcolor: "rgba(0,0,0,0.5)", color: "#fff", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" } }}>
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
              <Typography variant="caption">{all.length ? "Add more" : "Add photos"}</Typography>
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
      {all.length === 0 && <Typography variant="caption" color="text.secondary">{hint}. You can drop images here too.</Typography>}
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
    </Box>
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
      renderInput={(p) => <TextField {...p} label="Tags" placeholder={value.length ? "" : "quick, vegetarian, kids love it…"} />}
    />
  );
}

// ---------- recipe fields ----------

function RecipeFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [menu, setMenu] = useState<{ el: HTMLElement; i: number } | null>(null);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const rows = draft.ingredients;
  const setRows = (ingredients: IngredientRow[]) => set({ ingredients });
  const patchRow = (i: number, patch: Partial<IngredientRow>) =>
    setRows(rows.map((r, j) => (j === i ? ({ ...r, ...patch } as IngredientRow) : r)));
  const lastRef = useRef<HTMLInputElement | null>(null);
  const [focusNew, setFocusNew] = useState(false);
  useEffect(() => { if (focusNew) { lastRef.current?.focus(); setFocusNew(false); } }, [focusNew]);

  const addRow = () => { setRows([...rows, blankIngredient()]); setFocusNew(true); };

  return (
    <>
      <Stack direction="row" spacing={2}>
        <TextField label="Servings" type="number" value={draft.servings} onChange={(e) => set({ servings: e.target.value })} fullWidth
          slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }} />
        <TextField label="Prep" type="number" value={draft.prep_minutes} onChange={(e) => set({ prep_minutes: e.target.value })} fullWidth
          slotProps={{ htmlInput: { min: 0, inputMode: "numeric" }, input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
        <TextField label="Cook" type="number" value={draft.cook_minutes} onChange={(e) => set({ cook_minutes: e.target.value })} fullWidth
          slotProps={{ htmlInput: { min: 0, inputMode: "numeric" }, input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
      </Stack>

      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Ingredients</Typography>
          <Button size="small" startIcon={<ContentPasteIcon />} onClick={() => setPasteOpen(true)}>Paste a list</Button>
        </Stack>
        <Stack spacing={1}>
          {rows.map((row, i) => row.kind === "section" ? (
            <Stack key={row.key} direction="row" spacing={1} alignItems="center" sx={{ pt: i ? 1 : 0 }}>
              <TextField size="small" variant="standard" placeholder="Section, e.g. Sauce" value={row.name}
                onChange={(e) => patchRow(i, { name: e.target.value })} fullWidth
                slotProps={{ htmlInput: { maxLength: 60, style: { fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13 } } }} />
              <IconButton size="small" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove section"><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Stack>
          ) : (
            <Stack key={row.key} direction="row" spacing={1} alignItems="flex-start">
              <TextField size="small" placeholder="Qty" value={row.quantity} onChange={(e) => patchRow(i, { quantity: e.target.value })}
                sx={{ width: { xs: 64, sm: 80 }, flexShrink: 0 }} slotProps={{ htmlInput: { maxLength: 20 } }} />
              <TextField size="small" placeholder="Unit" value={row.unit} onChange={(e) => patchRow(i, { unit: e.target.value })}
                sx={{ width: { xs: 72, sm: 96 }, flexShrink: 0 }} slotProps={{ htmlInput: { maxLength: 30 } }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <IngredientNameField
                  value={row.name}
                  inputRef={i === rows.length - 1 ? lastRef : undefined}
                  onChange={(name) => patchRow(i, { name })}
                  onPick={(s) => patchRow(i, { name: s.name, ...(row.unit ? {} : { unit: s.unit }) })}
                  onEnter={() => { if (i === rows.length - 1) addRow(); }}
                />
                <Collapse in={row.note !== "" || notesOpen.has(row.key)}>
                  <TextField size="small" variant="standard" placeholder="Note, e.g. finely chopped" value={row.note}
                    onChange={(e) => patchRow(i, { note: e.target.value })} fullWidth sx={{ mt: 0.5 }} slotProps={{ htmlInput: { maxLength: 120 } }} />
                </Collapse>
              </Box>
              <IconButton size="small" onClick={(e) => setMenu({ el: e.currentTarget, i })} aria-label="Ingredient options" sx={{ mt: 0.5 }}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={addRow}>Ingredient</Button>
          <Button size="small" color="inherit" startIcon={<AddIcon />} onClick={() => setRows([...rows, { key: newKey(), kind: "section", name: "" }, blankIngredient()])}>
            Section
          </Button>
        </Stack>
        <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
          {menu && rows[menu.i]?.kind === "ingredient" && !notesOpen.has(rows[menu.i].key) && (rows[menu.i] as any).note === "" && (
            <MenuItem onClick={() => { setNotesOpen((n) => new Set(n).add(rows[menu.i].key)); setMenu(null); }}>Add a note</MenuItem>
          )}
          <MenuItem disabled={!menu || menu.i === 0} onClick={() => { if (menu) setRows(moveIn(rows, menu.i, -1)); setMenu(null); }}>
            <ArrowUpwardIcon fontSize="small" sx={{ mr: 1 }} />Move up
          </MenuItem>
          <MenuItem disabled={!menu || menu.i === rows.length - 1} onClick={() => { if (menu) setRows(moveIn(rows, menu.i, 1)); setMenu(null); }}>
            <ArrowDownwardIcon fontSize="small" sx={{ mr: 1 }} />Move down
          </MenuItem>
          <MenuItem onClick={() => { if (menu) setRows(rows.length > 1 ? rows.filter((_, j) => j !== menu.i) : [blankIngredient()]); setMenu(null); }}>
            <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Remove
          </MenuItem>
        </Menu>
        <PasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onAdd={(parsed) => {
          const kept = rows.filter((r) => r.kind === "section" || r.name.trim() || r.quantity.trim());
          setRows([...kept, ...parsed.map((p) => ({ key: newKey(), kind: "ingredient" as const, ...p }))]);
        }} />
      </Box>

      <StepsEditor steps={draft.steps} onChange={(steps) => set({ steps })} />
    </>
  );
}

function IngredientNameField({ value, onChange, onPick, onEnter, inputRef }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: { name: string; unit: string }) => void;
  onEnter: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [focused, setFocused] = useState(false);
  const { suggestions } = useIngredientSuggestions(value, focused);
  // Results for the previous query stay on screen while the next one loads, so filter here
  // too; otherwise "gar" would briefly offer everything.
  const options = useMemo(() => {
    const q = value.trim().toLowerCase();
    return suggestions.filter((s) => { const n = s.name.toLowerCase(); return !q || (n.includes(q) && n !== q); });
  }, [suggestions, value]);
  return (
    <Autocomplete
      freeSolo
      size="small"
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
      inputValue={value}
      onInputChange={(_, v, reason) => { if (reason !== "reset") onChange(v); }}
      onChange={(_, v) => { if (v && typeof v !== "string") onPick(v); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      renderOption={(props, o) => {
        const { key, ...rest } = props as any;
        return (
          <li key={key} {...rest}>
            <Stack direction="row" justifyContent="space-between" sx={{ width: "100%" }}>
              <span>{o.name}</span>
              <Typography variant="caption" color="text.secondary">{[o.unit, `used ${o.count}×`].filter(Boolean).join(" · ")}</Typography>
            </Stack>
          </li>
        );
      }}
      renderInput={(p) => (
        <TextField {...p} inputRef={inputRef} placeholder="Ingredient"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); onEnter(); } }}
          slotProps={{ htmlInput: { ...p.inputProps, maxLength: 120 } }} />
      )}
    />
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

function StepsEditor({ steps, onChange }: { steps: StepRow[]; onChange: (s: StepRow[]) => void }) {
  const patch = (i: number, p: Partial<StepRow>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const [timerFor, setTimerFor] = useState<Set<string>>(new Set());
  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Steps</Typography>
      <Stack spacing={1.5}>
        {steps.map((s, i) => (
          <Card key={s.key} variant="outlined" sx={{ ...cardSx, p: 1.5, display: "flex", gap: 1.5 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "action.selected", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0, mt: 0.5 }}>
              {i + 1}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TextField multiline minRows={1} fullWidth variant="standard" placeholder="Describe this step" value={s.text}
                onChange={(e) => patch(i, { text: e.target.value })} slotProps={{ htmlInput: { maxLength: 2000 } }} />
              {(s.timer || timerFor.has(s.key)) ? (
                <TextField size="small" type="number" label="Timer" value={s.timer} onChange={(e) => patch(i, { timer: e.target.value })}
                  sx={{ mt: 1, width: 140 }} slotProps={{ htmlInput: { min: 0 }, input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
              ) : (
                <Button size="small" color="inherit" startIcon={<TimerOutlinedIcon />} sx={{ mt: 0.5, opacity: 0.7 }}
                  onClick={() => setTimerFor((t) => new Set(t).add(s.key))}>
                  Add timer
                </Button>
              )}
            </Box>
            <Stack>
              <IconButton size="small" disabled={i === 0} onClick={() => onChange(moveIn(steps, i, -1))} aria-label="Move step up"><ArrowUpwardIcon fontSize="small" /></IconButton>
              <IconButton size="small" disabled={i === steps.length - 1} onClick={() => onChange(moveIn(steps, i, 1))} aria-label="Move step down"><ArrowDownwardIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => onChange(steps.length > 1 ? steps.filter((_, j) => j !== i) : [blankStep()])} aria-label="Remove step"><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Stack>
          </Card>
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => onChange([...steps, blankStep()])}>Step</Button>
    </Box>
  );
}

// ---------- box instructions fields ----------

function InstructionFields({ draft, set, accent }: { draft: Draft; set: (p: Partial<Draft>) => void; accent: string }) {
  const methods = draft.methods;
  const patch = (i: number, p: Partial<MethodRow>) => set({ methods: methods.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const used = new Set(methods.map((m) => m.method));
  const nextMethod = COOK_METHODS.find((m) => !used.has(m)) ?? "other";

  return (
    <>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Cooking directions</Typography>
        <Stack spacing={2}>
          {methods.map((m, i) => (
            <Card key={m.key} variant="outlined" sx={{ ...cardSx, p: 2, borderLeft: `4px solid ${accent}` }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", flex: 1 }}>
                  {COOK_METHODS.map((opt) => (
                    <Chip key={opt} size="small"
                      icon={<MethodIconView method={opt} sx={{ fontSize: 16 }} />}
                      label={COOK_METHOD_LABELS[opt]}
                      color={m.method === opt ? "primary" : "default"}
                      variant={m.method === opt ? "filled" : "outlined"}
                      onClick={() => patch(i, { method: opt })} />
                  ))}
                </Box>
                <IconButton size="small" aria-label="Remove method"
                  onClick={() => set({ methods: methods.length > 1 ? methods.filter((_, j) => j !== i) : [blankMethod()] })}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                {m.method === "microwave" ? (
                  <TextField size="small" label="Power" value={m.power} onChange={(e) => patch(i, { power: e.target.value })}
                    placeholder="High / 50%" sx={{ width: { sm: 160 } }} slotProps={{ htmlInput: { maxLength: 30 } }} />
                ) : (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField size="small" label="Temp" type="number" value={m.temp} onChange={(e) => patch(i, { temp: e.target.value })}
                      sx={{ width: 110 }} slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }} />
                    <ToggleButtonGroup size="small" exclusive value={m.temp_unit} onChange={(_, v) => v && patch(i, { temp_unit: v })}>
                      <ToggleButton value="F">°F</ToggleButton>
                      <ToggleButton value="C">°C</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>
                )}
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField size="small" label="Min" type="number" value={m.minutes_min} onChange={(e) => patch(i, { minutes_min: e.target.value })}
                    sx={{ width: 90 }} slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }} />
                  <Typography color="text.secondary">–</Typography>
                  <TextField size="small" label="Max" type="number" value={m.minutes_max} onChange={(e) => patch(i, { minutes_max: e.target.value })}
                    sx={{ width: 90 }} slotProps={{ htmlInput: { min: 0, inputMode: "numeric" } }} />
                  <Typography variant="body2" color="text.secondary">min</Typography>
                </Stack>
                {m.method !== "microwave" && (
                  <FormControlLabel control={<Switch checked={m.preheat} onChange={(e) => patch(i, { preheat: e.target.checked })} />} label="Preheat" />
                )}
              </Stack>

              <TextField sx={{ mt: 2 }} fullWidth multiline minRows={2} size="small" label="Steps (one per line)"
                value={m.stepsText} onChange={(e) => patch(i, { stepsText: e.target.value })}
                placeholder={"Remove film\nPlace on middle rack\nLet stand 2 minutes"} />
            </Card>
          ))}
        </Stack>
        {methods.length < 6 && (
          <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => set({ methods: [...methods, blankMethod(nextMethod)] })}>
            Another method
          </Button>
        )}
      </Box>

      <TextField label="Storage" value={draft.storage_note} onChange={(e) => set({ storage_note: e.target.value })} fullWidth multiline
        placeholder="Keep frozen. Do not refreeze once thawed." slotProps={{ htmlInput: { maxLength: 500 } }} />
    </>
  );
}
