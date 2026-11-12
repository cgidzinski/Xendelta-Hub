import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LinkIcon from "@mui/icons-material/Link";
import NotesIcon from "@mui/icons-material/Notes";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import { useSnackbar } from "notistack";
import { NOTE_COLORS, isSafeUrl, type NoteType } from "@shared/xennote/notes";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { noteShareUrl, useXenNoteActions } from "../../../../hooks/xennote/useXenNote";
import type { XenNote, XenNotebook } from "../../../../types/XenNote";
import { NOTE_COLOR_LABELS, noteSurfaceSx, swatchColor } from "../noteColors";
import { changeType, draftFromNote, emptyDraft, isDirty, isEmptyDraft, toInput, type NoteDraft } from "../noteDraft";

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

const TYPES: Array<{ value: NoteType; label: string; icon: ReactElement }> = [
  { value: "text", label: "Note", icon: <NotesIcon fontSize="small" /> },
  { value: "checklist", label: "List", icon: <CheckBoxOutlinedIcon fontSize="small" /> },
  { value: "image", label: "Photos", icon: <ImageOutlinedIcon fontSize="small" /> },
  { value: "link", label: "Link", icon: <LinkIcon fontSize="small" /> },
];

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
      note ? draftFromNote(note) : emptyDraft({ type: startType ?? "text", notebook_id: startNotebookId ?? null }),
    // The draft is reset each time the dialog opens, for a given note or a fresh start
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, note?._id, startType, startNotebookId],
  );
  const [draft, setDraft] = useState<NoteDraft>(initial);
  const [saving, setSaving] = useState(false);
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

  const addPhotos = async (files: FileList | null) => {
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

  return (
    <ResponsiveDialog
      open={open}
      onClose={saveAndClose}
      maxWidth="sm"
      title={readOnly ? "Note" : live ? "Edit note" : "New note"}
      slotProps={{ paper: { sx: noteSurfaceSx(draft.color)(theme) } }}
      actions={
        <>
          {live && !readOnly && (
            <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={remove} sx={{ mr: "auto" }}>
              Delete
            </Button>
          )}
          <Button variant="contained" onClick={saveAndClose} disabled={saving || linkError}>
            {readOnly ? "Close" : "Done"}
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {!readOnly && (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={draft.type}
            onChange={(_, v: NoteType | null) => v && setDraft((d) => changeType(d, v))}
            aria-label="Note type"
            sx={{ flexWrap: "wrap" }}
          >
            {TYPES.map((t) => (
              <ToggleButton key={t.value} value={t.value} sx={{ gap: 0.5, textTransform: "none" }}>
                {t.icon} {t.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}

        <TextField
          label="Title"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          fullWidth
          autoFocus={!live}
          disabled={readOnly}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />

        {(draft.type === "text" || draft.type === "image") && (
          <TextField
            label={draft.type === "image" ? "Caption" : readOnly ? "Note" : "Take a note…"}
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            fullWidth
            multiline
            minRows={draft.type === "image" ? 2 : 5}
            maxRows={14}
            disabled={readOnly}
            slotProps={{ htmlInput: { maxLength: 20000 } }}
          />
        )}

        {draft.type === "checklist" && (
          <Box>
            {draft.checklist.map((item, i) => (
              <Box key={item._id ?? i} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Checkbox
                  checked={item.done}
                  disabled={readOnly}
                  onChange={(e) => updateItem(i, { done: e.target.checked })}
                  slotProps={{ input: { "aria-label": `Done: ${item.text || "item"}` } }}
                />
                <TextField
                  variant="standard"
                  fullWidth
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
            ))}
            {!readOnly && (
              <Button
                startIcon={<AddIcon />}
                onClick={() => set({ checklist: [...draft.checklist, { text: "", done: false }] })}
                sx={{ mt: 0.5 }}
              >
                Add item
              </Button>
            )}
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

        {draft.type === "image" && (
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
                <Button
                  startIcon={<AddPhotoAlternateOutlinedIcon />}
                  onClick={() => fileInput.current?.click()}
                  disabled={actions.addImages.isPending}
                  sx={{ mt: 1 }}
                >
                  {actions.addImages.isPending ? "Uploading..." : "Add photos"}
                </Button>
              </>
            )}
          </Box>
        )}

        {!readOnly && (
          <>
            <Autocomplete
              multiple
              freeSolo
              options={labelSuggestions}
              value={draft.labels}
              onChange={(_, v) => set({ labels: v as string[] })}
              renderTags={(value, getTagProps) =>
                value.map((label, index) => (
                  <Chip variant="outlined" size="small" label={label} {...getTagProps({ index })} key={label} />
                ))
              }
              renderInput={(params) => <TextField {...params} label="Labels" placeholder="Add a label" />}
            />

            <Box>
              <Typography variant="caption" color="text.secondary">
                Colour
              </Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                {NOTE_COLORS.map((c) => {
                  const main = swatchColor(theme, c);
                  return (
                    <Tooltip key={c} title={NOTE_COLOR_LABELS[c]}>
                      <IconButton
                        aria-label={`${NOTE_COLOR_LABELS[c]} colour`}
                        aria-pressed={draft.color === c}
                        onClick={() => set({ color: c })}
                        size="small"
                        sx={{
                          width: 28,
                          height: 28,
                          bgcolor: main ?? "background.paper",
                          border: 2,
                          borderColor: draft.color === c ? "text.primary" : "divider",
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>

            <TextField
              select
              label="Notebook"
              value={draft.notebook_id ?? ""}
              onChange={(e) => set({ notebook_id: e.target.value || null })}
              helperText={
                draft.notebook_id ? "Everyone in the notebook can see this note" : "Private: only you can see this note"
              }
              fullWidth
            >
              <MenuItem value="">Private (only me)</MenuItem>
              {writableNotebooks.map((b) => (
                <MenuItem key={b._id} value={b._id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                variant={draft.pinned ? "contained" : "outlined"}
                startIcon={draft.pinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
                onClick={() => set({ pinned: !draft.pinned })}
              >
                {draft.pinned ? "Pinned" : "Pin"}
              </Button>
              <Button
                variant={draft.archived ? "contained" : "outlined"}
                startIcon={<ArchiveOutlinedIcon />}
                onClick={() => set({ archived: !draft.archived })}
              >
                {draft.archived ? "Archived" : "Archive"}
              </Button>
            </Box>

            {live && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Public link
                </Typography>
                {shareToken ? (
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 0.5 }}>
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
                  <Box sx={{ mt: 0.5 }}>
                    <Button size="small" variant="outlined" onClick={() => shareAction("enable")}>
                      Create link
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      Anyone with it can read this note
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}
