import { alpha } from "@mui/material/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogContent,
  IconButton,
  InputBase,
  ListItemIcon,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import LinkIcon from "@mui/icons-material/Link";
import NotesIcon from "@mui/icons-material/Notes";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import { useSnackbar } from "notistack";
import { NOTE_COLORS, isSafeUrl, type NoteType } from "@shared/xennote/notes";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { noteShareUrl, useXenNoteActions } from "../../../../hooks/xennote/useXenNote";
import type { XenNote, XenNotebook } from "../../../../types/XenNote";
import { NOTE_COLOR_LABELS, noteSurfaceSx, swatchColor } from "../noteColors";
import NoteReminderMenu from "./NoteReminderMenu";
import {
  changeType,
  draftFromNote,
  emptyDraft,
  isDirty,
  isEmptyDraft,
  moveItem,
  toInput,
  type NoteDraft,
} from "../noteDraft";

const AUTOSAVE_MS = 800;

interface NoteEditorProps {
  open: boolean;
  onClose: () => void;
  /** The note to edit; null starts a new one. */
  note: XenNote | null;
  /** A new note starts as this type (the quick-add buttons). */
  startType?: NoteType;
  /** A new note starts in this notebook (when one is open on the board). */
  startNotebookId?: string | null;
  notebooks: XenNotebook[];
  labelSuggestions: string[];
}

/**
 * Write or edit a note. Closing saves it (like Keep) unless it is empty or was not changed; delete is
 * explicit. A person with view-only access sees the note without being able to change it.
 */
export default function NoteEditor({
  open,
  onClose,
  note,
  startType,
  startNotebookId,
  notebooks,
  labelSuggestions,
}: NoteEditorProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const actions = useXenNoteActions();
  const fileInput = useRef<HTMLInputElement>(null);

  const initial = useMemo(
    () =>
      note
        ? draftFromNote(note)
        : emptyDraft({
            type: startType ?? "text",
            notebook_id: startNotebookId ?? null,
            checklist: startType === "checklist" ? [{ text: "", done: false }] : [],
          }),
    // The draft is reset each time the dialog opens, for a given note or a fresh start
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, note?._id, startType, startNotebookId],
  );
  const [draft, setDraft] = useState<NoteDraft>(initial);
  const [saving, setSaving] = useState(false);
  // Autosave state for an existing note: shown beside Done as "Saving…" then "Saved"
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved">("idle");
  const [showDone, setShowDone] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [labelAnchor, setLabelAnchor] = useState<HTMLElement | null>(null);
  const [bookAnchor, setBookAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [reminderAnchor, setReminderAnchor] = useState<HTMLElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // What the server holds for this note right now (photos and the link change it outside the draft).
  const [live, setLive] = useState<XenNote | null>(note);

  // Reset when the dialog opens for a note (or a fresh start), never because the board refetched behind
  // it: a collaborator's live update must not wipe what is being typed.
  useEffect(() => {
    if (open) {
      setDraft(initial);
      setLive(note);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const readOnly = !!live && !live.can_edit;
  const set = (patch: Partial<NoteDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // An existing note saves itself shortly after you stop typing; a new one is created when you press Done.
  useEffect(() => {
    if (!open || readOnly || !live || !isDirty(draft, draftFromNote(live))) return;
    if (draft.type === "link" && draft.link.url.trim() !== "" && !isSafeUrl(draft.link.url.trim())) return;
    const timer = setTimeout(async () => {
      setAutosave("saving");
      try {
        const saved = await actions.updateNote.mutateAsync({ id: live._id, input: toInput(draft) });
        setLive((cur) => (cur && cur._id === saved._id ? { ...cur, ...saved } : cur));
        setAutosave("saved");
      } catch (e) {
        setAutosave("idle");
        enqueueSnackbar((e as Error).message || "Couldn't save the note", { variant: "error" });
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, live, open, readOnly]);
  useEffect(() => {
    if (open) setAutosave("idle");
  }, [open, initial]);
  // My reminder on this note. Personal, so it works in a notebook I can only view too; it isn't part of the draft.
  const setReminder = async (at: string | null) => {
    if (!live) return;
    try {
      const saved = await actions.setReminder.mutateAsync({ id: live._id, at });
      setLive((cur) => (cur && cur._id === saved._id ? { ...cur, reminder: saved.reminder } : cur));
      enqueueSnackbar(at ? "Reminder set" : "Reminder removed", { variant: "success" });
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't set the reminder", { variant: "error" });
    }
  };
  const writableNotebooks = notebooks.filter((b) => b.my_role === "owner" || b.my_role === "editor");

  const pendingUrls = useMemo(() => draft.pendingImages.map((f) => URL.createObjectURL(f)), [draft.pendingImages]);
  useEffect(() => () => pendingUrls.forEach((u) => URL.revokeObjectURL(u)), [pendingUrls]);

  const saveAndClose = async () => {
    if (readOnly) return onClose();
    try {
      setSaving(true);
      if (!live) {
        if (!isEmptyDraft(draft)) {
          const created = await actions.createNote.mutateAsync(toInput(draft));
          if (draft.pendingImages.length)
            await actions.addImages.mutateAsync({ id: created._id, files: draft.pendingImages });
        }
      } else if (isDirty(draft, draftFromNote(live))) {
        await actions.updateNote.mutateAsync({ id: live._id, input: toInput(draft) });
      }
      onClose();
    } catch (e) {
      // Stay open so nothing typed is lost; say what to fix
      enqueueSnackbar((e as Error).message || "Couldn't save the note", { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!live) return onClose();
    const ok = await confirm({
      title: "Delete this note?",
      message: "It's deleted for everyone who can see it, and can't be brought back.",
      confirmLabel: "Delete note",
    });
    if (!ok) return;
    try {
      await actions.deleteNote.mutateAsync(live._id);
      onClose();
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't delete the note", { variant: "error" });
    }
  };

  const addPhotos = async (files: ArrayLike<File> | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    if (!live) return set({ pendingImages: [...draft.pendingImages, ...list] });
    try {
      setLive(await actions.addImages.mutateAsync({ id: live._id, files: list }));
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't add the photos", { variant: "error" });
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const removePhoto = async (imageId: string) => {
    if (!live) return;
    try {
      setLive(await actions.removeImage.mutateAsync({ id: live._id, imageId }));
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't remove the photo", { variant: "error" });
    }
  };

  const shareAction = async (action: "enable" | "rotate" | "disable") => {
    if (!live) return;
    try {
      setLive(await actions.shareNote.mutateAsync({ id: live._id, action }));
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't update the link", { variant: "error" });
    }
  };

  const linkError = draft.type === "link" && draft.link.url.trim() !== "" && !isSafeUrl(draft.link.url.trim());
  const shareToken = live?.share?.enabled ? live.share.token : null;

  const updateItem = (i: number, patch: Partial<NoteDraft["checklist"][number]>) =>
    set({ checklist: draft.checklist.map((item, idx) => (idx === i ? { ...item, ...patch } : item)) });

  const colorOpen = !!colorAnchor;
  // The writing area reads as a field: a soft inset with a border, tall enough not to feel cramped.
  const fieldSx = {
    bgcolor: alpha(theme.palette.text.primary, 0.05),
    border: 1,
    borderColor: "divider",
    borderRadius: 2,
    p: 2,
    minHeight: 240,
    alignItems: "flex-start",
    fontSize: 16,
    lineHeight: 1.6,
    "&:focus-within": { borderColor: "primary.main" },
  } as const;
  const isList = draft.type === "checklist";

  return (
    <>
      <Dialog
        open={open}
        onClose={saveAndClose}
        fullWidth
        maxWidth={false}
        fullScreen={isMobile}
        sx={{ "& .MuiDialog-container": { alignItems: isMobile ? "stretch" : "flex-start" } }}
        onPaste={(e) => {
          const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (!readOnly && images.length) {
            e.preventDefault();
            addPhotos(images);
          }
        }}
        slotProps={{
          paper: {
            sx: [{ maxWidth: 680, mt: { sm: 8 }, borderRadius: { sm: 3 } }, noteSurfaceSx(draft.color)],
          },
          backdrop: { sx: { bgcolor: alpha(theme.palette.common.black, 0.4) } },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, pl: 3, pr: 1, pt: 1.5 }}>
          <InputBase
            fullWidth
            placeholder="Title"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            disabled={readOnly}
            slotProps={{ input: { maxLength: 200, "aria-label": "Title" } }}
            sx={{ fontSize: 20, fontWeight: 500 }}
          />
          {readOnly ? (
            <IconButton aria-label="Close" onClick={saveAndClose}>
              <CloseIcon />
            </IconButton>
          ) : (
            <>
              <Tooltip title={draft.pinned ? "Unpin" : "Pin"}>
                <IconButton
                  aria-label={draft.pinned ? "Unpin" : "Pin"}
                  aria-pressed={draft.pinned}
                  onClick={() => set({ pinned: !draft.pinned })}
                >
                  {draft.pinned ? <PushPinIcon color="primary" /> : <PushPinOutlinedIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title="More">
                <IconButton aria-label="More" onClick={(e) => setMoreAnchor(e.currentTarget)}>
                  <MoreVertIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>

        <DialogContent sx={{ pt: 1.5, px: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            {!live && !readOnly && !draft.body.trim() && draft.checklist.every((i) => !i.text.trim()) && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={isList ? "list" : "note"}
                aria-label="Note or list"
                onChange={(_, v: "note" | "list" | null) => {
                  if (!v) return;
                  setDraft((d) => {
                    const next = changeType(d, v === "list" ? "checklist" : "text");
                    return v === "list" && next.checklist.length === 0
                      ? { ...next, checklist: [{ text: "", done: false }] }
                      : next;
                  });
                }}
                sx={{ alignSelf: "flex-start" }}
              >
                <ToggleButton value="note" sx={{ gap: 0.75, px: 2, textTransform: "none" }}>
                  <NotesIcon fontSize="small" />
                  Note
                </ToggleButton>
                <ToggleButton value="list" sx={{ gap: 0.75, px: 2, textTransform: "none" }}>
                  <CheckBoxOutlinedIcon fontSize="small" />
                  List
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {(draft.type === "text" || draft.type === "image") && (
              <InputBase
                fullWidth
                multiline
                minRows={draft.type === "image" ? 4 : 9}
                maxRows={22}
                sx={fieldSx}
                autoFocus={!live && draft.type === "text"}
                placeholder={draft.type === "image" ? "Add a caption" : "Take a note…"}
                value={draft.body}
                onChange={(e) => set({ body: e.target.value })}
                disabled={readOnly}
                slotProps={{ input: { maxLength: 20000, "aria-label": draft.type === "image" ? "Caption" : "Note" } }}
              />
            )}

            {draft.type === "checklist" && (
              <Box sx={{ ...fieldSx, display: "block" }}>
                {(() => {
                  const row = (item: NoteDraft["checklist"][number], i: number) => (
                    <Box
                      key={item._id ?? i}
                      draggable={!readOnly && !item.done}
                      onDragStart={() => setDragFrom(i)}
                      onDragOver={(e) => dragFrom !== null && e.preventDefault()}
                      onDrop={() => {
                        if (dragFrom !== null) set({ checklist: moveItem(draft.checklist, dragFrom, i) });
                        setDragFrom(null);
                      }}
                      onDragEnd={() => setDragFrom(null)}
                      sx={{ display: "flex", alignItems: "center", gap: 0.5, opacity: dragFrom === i ? 0.4 : 1 }}
                    >
                      {!readOnly && !item.done && (
                        <DragIndicatorIcon
                          fontSize="small"
                          aria-label="Drag to reorder"
                          sx={{ color: "text.disabled", cursor: "grab" }}
                        />
                      )}
                      <Checkbox
                        checked={item.done}
                        disabled={readOnly}
                        onChange={(e) => updateItem(i, { done: e.target.checked })}
                        slotProps={{ input: { "aria-label": `Done: ${item.text || "item"}` } }}
                      />
                      <TextField
                        variant="standard"
                        fullWidth
                        autoFocus={!live && i === 0}
                        value={item.text}
                        disabled={readOnly}
                        onChange={(e) => updateItem(i, { text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            set({
                              checklist: [
                                ...draft.checklist.slice(0, i + 1),
                                { text: "", done: false },
                                ...draft.checklist.slice(i + 1),
                              ],
                            });
                          }
                        }}
                        slotProps={{
                          htmlInput: { maxLength: 500, "aria-label": `Item ${i + 1}` },
                          input: { sx: { textDecoration: item.done ? "line-through" : "none" } },
                        }}
                      />
                      {!readOnly && (
                        <IconButton
                          aria-label="Remove item"
                          size="small"
                          onClick={() => set({ checklist: draft.checklist.filter((_, idx) => idx !== i) })}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  );
                  const indexed = draft.checklist.map((item, i) => ({ item, i }));
                  const active = indexed.filter((x) => !x.item.done);
                  const done = indexed.filter((x) => x.item.done);
                  return (
                    <>
                      {active.map((x) => row(x.item, x.i))}
                      {!readOnly && (
                        <Button
                          startIcon={<AddIcon />}
                          onClick={() => set({ checklist: [...draft.checklist, { text: "", done: false }] })}
                          sx={{ mt: 0.5 }}
                        >
                          Add item
                        </Button>
                      )}
                      {done.length > 0 && (
                        <Box sx={{ mt: 1.5, borderTop: 1, borderColor: "divider" }}>
                          <Button
                            size="small"
                            color="inherit"
                            onClick={() => setShowDone((v) => !v)}
                            aria-expanded={showDone}
                            startIcon={
                              <ExpandMoreIcon
                                sx={{ transform: showDone ? "none" : "rotate(-90deg)", transition: "transform 120ms" }}
                              />
                            }
                            sx={{ mt: 0.5, textTransform: "none" }}
                          >
                            {done.length} completed
                          </Button>
                          <Collapse in={showDone}>{done.map((x) => row(x.item, x.i))}</Collapse>
                        </Box>
                      )}
                    </>
                  );
                })()}
              </Box>
            )}

            {draft.type === "link" && (
              <Stack spacing={1.5}>
                <TextField
                  label="Web address"
                  placeholder="https://"
                  value={draft.link.url}
                  onChange={(e) => set({ link: { ...draft.link, url: e.target.value } })}
                  error={linkError}
                  helperText={linkError ? "Use a web address that starts with http:// or https://" : " "}
                  fullWidth
                  disabled={readOnly}
                />
                <TextField
                  label="Link title"
                  value={draft.link.title}
                  onChange={(e) => set({ link: { ...draft.link, title: e.target.value } })}
                  fullWidth
                  disabled={readOnly}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                />
                <TextField
                  label="Description"
                  value={draft.link.description}
                  onChange={(e) => set({ link: { ...draft.link, description: e.target.value } })}
                  fullWidth
                  multiline
                  minRows={2}
                  disabled={readOnly}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                />
              </Stack>
            )}

            {(draft.type === "image" || (live?.images.length ?? 0) + draft.pendingImages.length > 0) && (
              <Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {(live?.images ?? []).map((img) => (
                    <Box key={img._id} sx={{ position: "relative" }}>
                      <Box
                        component="img"
                        src={img.url}
                        alt=""
                        sx={{ width: 96, height: 96, objectFit: "cover", borderRadius: 1, display: "block" }}
                      />
                      {!readOnly && (
                        <IconButton
                          size="small"
                          aria-label="Remove photo"
                          onClick={() => removePhoto(img._id)}
                          sx={{ position: "absolute", top: 2, right: 2, bgcolor: "background.paper" }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                  {pendingUrls.map((url, i) => (
                    <Box key={url} sx={{ position: "relative" }}>
                      <Box
                        component="img"
                        src={url}
                        alt=""
                        sx={{ width: 96, height: 96, objectFit: "cover", borderRadius: 1, display: "block" }}
                      />
                      <IconButton
                        size="small"
                        aria-label="Remove photo"
                        onClick={() => set({ pendingImages: draft.pendingImages.filter((_, idx) => idx !== i) })}
                        sx={{ position: "absolute", top: 2, right: 2, bgcolor: "background.paper" }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {(draft.labels.length > 0 || draft.notebook_id) && (
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                {draft.notebook_id && (
                  <Chip
                    size="small"
                    icon={<MenuBookOutlinedIcon />}
                    label={notebooks.find((b) => b._id === draft.notebook_id)?.name ?? "Notebook"}
                  />
                )}
                {draft.labels.map((label) => (
                  <Chip
                    key={label}
                    size="small"
                    variant="outlined"
                    label={label}
                    onDelete={readOnly ? undefined : () => set({ labels: draft.labels.filter((l) => l !== label) })}
                  />
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            px: 1,
            py: 0.75,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          {!readOnly && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                id="xennote-photo-input"
                onChange={(e) => addPhotos(e.target.files)}
              />
              <Tooltip title="Add photos">
                <IconButton
                  size="small"
                  aria-label="Add photos"
                  disabled={actions.addImages.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  <AddPhotoAlternateOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Colour">
                <IconButton size="small" aria-label="Colour" onClick={(e) => setColorAnchor(e.currentTarget)}>
                  <PaletteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Labels">
                <IconButton size="small" aria-label="Labels" onClick={(e) => setLabelAnchor(e.currentTarget)}>
                  <LabelOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Notebook">
                <IconButton size="small" aria-label="Notebook" onClick={(e) => setBookAnchor(e.currentTarget)}>
                  <MenuBookOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          {live && (
            <Tooltip title={live.reminder ? "Reminder" : "Remind me"}>
              <IconButton
                size="small"
                aria-label="Reminder"
                color={live.reminder && !live.reminder.sent ? "primary" : "default"}
                onClick={(e) => setReminderAnchor(e.currentTarget)}
              >
                {live.reminder && !live.reminder.sent ? (
                  <NotificationsActiveIcon fontSize="small" />
                ) : (
                  <NotificationsNoneIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          {autosave !== "idle" && (
            <Typography variant="caption" color="text.secondary" role="status" sx={{ mr: 1 }}>
              {autosave === "saving" ? "Saving…" : "Saved"}
            </Typography>
          )}
          <Button variant="contained" onClick={saveAndClose} disabled={saving || linkError}>
            {readOnly ? "Close" : "Done"}
          </Button>
        </Box>
      </Dialog>

      <Popover
        open={colorOpen}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ display: "flex", gap: 1, p: 1.5 }} role="group" aria-label="Note colour">
          {NOTE_COLORS.map((c) => {
            const main = swatchColor(theme, c);
            return (
              <IconButton
                key={c}
                size="small"
                aria-label={`${NOTE_COLOR_LABELS[c]} colour`}
                aria-pressed={draft.color === c}
                onClick={() => {
                  set({ color: c });
                  setColorAnchor(null);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: main ?? "background.paper",
                  border: 2,
                  borderColor: draft.color === c ? "text.primary" : "divider",
                }}
              />
            );
          })}
        </Box>
      </Popover>

      <Popover
        open={!!labelAnchor}
        anchorEl={labelAnchor}
        onClose={() => setLabelAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 1.5, width: 280 }}>
          <Autocomplete
            multiple
            freeSolo
            size="small"
            options={labelSuggestions}
            value={draft.labels}
            onChange={(_, v) => set({ labels: v as string[] })}
            renderTags={() => null}
            renderInput={(params) => (
              <TextField
                {...params}
                autoFocus
                placeholder="Add a label"
                slotProps={{ htmlInput: { ...params.inputProps, "aria-label": "Add a label" } }}
              />
            )}
          />
        </Box>
      </Popover>

      <Menu anchorEl={bookAnchor} open={!!bookAnchor} onClose={() => setBookAnchor(null)}>
        {[{ _id: "", name: "Private (only me)" }, ...writableNotebooks].map((b) => (
          <MenuItem
            key={b._id}
            selected={(draft.notebook_id ?? "") === b._id}
            onClick={() => {
              set({ notebook_id: b._id || null });
              setBookAnchor(null);
            }}
          >
            {b.name}
          </MenuItem>
        ))}
      </Menu>

      <Menu anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
        <MenuItem
          onClick={() => {
            setDraft((d) => changeType(d, isList ? "text" : "checklist"));
            setMoreAnchor(null);
          }}
        >
          <ListItemIcon>
            {isList ? <NotesIcon fontSize="small" /> : <CheckBoxOutlinedIcon fontSize="small" />}
          </ListItemIcon>
          {isList ? "Turn into a note" : "Turn into a list"}
        </MenuItem>
        <MenuItem
          sx={{ display: live ? "flex" : "none" }}
          onClick={() => {
            set({ archived: !draft.archived });
            setMoreAnchor(null);
          }}
        >
          <ListItemIcon>
            <ArchiveOutlinedIcon fontSize="small" />
          </ListItemIcon>
          {draft.archived ? "Unarchive" : "Archive"}
        </MenuItem>
        <MenuItem
          sx={{ display: live ? "flex" : "none" }}
          onClick={() => {
            setMoreAnchor(null);
            setShareOpen(true);
          }}
        >
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          Public link
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMoreAnchor(null);
            remove();
          }}
          sx={{ color: "error.main", display: live ? "flex" : "none" }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      <NoteReminderMenu
        anchor={reminderAnchor}
        onClose={() => setReminderAnchor(null)}
        reminder={live?.reminder ?? null}
        onSet={setReminder}
      />

      <ResponsiveDialog open={shareOpen} onClose={() => setShareOpen(false)} maxWidth="xs" title="Public link">
        {shareToken ? (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              size="small"
              value={noteShareUrl(shareToken)}
              slotProps={{ input: { readOnly: true } }}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <IconButton
              aria-label="Copy link"
              onClick={() => {
                navigator.clipboard.writeText(noteShareUrl(shareToken));
                enqueueSnackbar("Link copied", { variant: "success" });
              }}
            >
              <ContentCopyIcon />
            </IconButton>
            <Button size="small" onClick={() => shareAction("rotate")}>
              New link
            </Button>
            <Button size="small" color="error" onClick={() => shareAction("disable")}>
              Stop sharing
            </Button>
          </Box>
        ) : (
          <Box>
            <Button variant="outlined" onClick={() => shareAction("enable")}>
              Create link
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Anyone with the link can read this note.
            </Typography>
          </Box>
        )}
      </ResponsiveDialog>
    </>
  );
}
