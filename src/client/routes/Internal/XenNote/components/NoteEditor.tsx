import { alpha } from "@mui/material/styles";
import { lazy, Suspense, useEffect, useState } from "react";
import { Button, Dialog, DialogContent, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { formatDistanceToNow } from "date-fns";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import { isSafeUrl, type NoteType } from "@shared/xennote/notes";
import type { XenNote, XenNotebook } from "../../../../types/XenNote";
import { useNoteDraft } from "../hooks/useNoteDraft";
import { changeType } from "../noteDraft";
import { noteSurfaceSx } from "../noteColors";
import NoteBacklinks from "./NoteBacklinks";
import NoteChecklistEditor from "./NoteChecklistEditor";
import NoteChips from "./NoteChips";
import NoteColorPopover from "./NoteColorPopover";
import NoteEditorToolbar from "./NoteEditorToolbar";
import NoteHistoryDialog from "./NoteHistoryDialog";
import NoteLabelPopover from "./NoteLabelPopover";
import NoteLinkFields from "./NoteLinkFields";
import NoteMoreMenu from "./NoteMoreMenu";
import NoteNotebookMenu from "./NoteNotebookMenu";
import NotePhotoGrid from "./NotePhotoGrid";
import NoteReminderMenu from "./NoteReminderMenu";
import NoteShareDialog from "./NoteShareDialog";
import NoteTextBody from "./NoteTextBody";
import NoteTitleRow from "./NoteTitleRow";
import NoteTypeToggle from "./NoteTypeToggle";

const NoteBlockEditor = lazy(() => import("../editor/NoteBlockEditor"));

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
  /** Every note with a title, newest first: what a [[link]] can point to and what typing "[[" suggests. */
  titles?: Array<{ _id: string; title: string }>;
  /** Open another note (a [[link]] in the preview, or one under "Linked from"). */
  onOpenNote?: (id: string) => void;
}

/**
 * Write or edit a note. Closing saves it (like Keep) unless it is empty or was not changed; delete is
 * explicit. A person with view-only access sees the note without being able to change it.
 * This is the dialog shell: the sections and the draft/autosave logic live in their own files.
 */
export default function NoteEditor({
  open,
  onClose,
  note,
  startType,
  startNotebookId,
  notebooks,
  labelSuggestions,
  titles = [],
  onOpenNote,
}: NoteEditorProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const n = useNoteDraft({ open, onClose, note, startType, startNotebookId, onOpenNote });
  const { draft, setDraft, set, live, readOnly } = n;

  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>();
  useEffect(() => {
    setEditing(false);
    setSource(false);
  }, [note?._id, open]);
  useEffect(() => {
    if (!isMobile || !open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const resize = () => setViewportHeight(Math.round(viewport.height));
    resize();
    viewport.addEventListener("resize", resize);
    return () => viewport.removeEventListener("resize", resize);
  }, [isMobile, open]);
  const viewing = readOnly || (!!note && !editing);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [labelAnchor, setLabelAnchor] = useState<HTMLElement | null>(null);
  const [bookAnchor, setBookAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [reminderAnchor, setReminderAnchor] = useState<HTMLElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isList = draft.type === "checklist";
  const linkError = draft.type === "link" && draft.link.url.trim() !== "" && !isSafeUrl(draft.link.url.trim());
  const writableNotebooks = notebooks.filter((b) => b.my_role === "owner" || b.my_role === "editor");
  const photoCount = (live?.images.length ?? 0) + draft.pendingImages.length;
  const isBlank = !draft.body.trim() && draft.checklist.every((i) => !i.text.trim());

  return (
    <>
      <Dialog
        open={open}
        onClose={n.saveAndClose}
        fullWidth
        maxWidth={false}
        fullScreen={isMobile}
        sx={{ "& .MuiDialog-container": { alignItems: isMobile ? "stretch" : "flex-start" } }}
        onPaste={(e) => {
          const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (!viewing && images.length) {
            e.preventDefault();
            n.addPhotos(images);
          }
        }}
        slotProps={{
          paper: {
            style: isMobile && viewportHeight ? { height: viewportHeight } : undefined,
            sx: [{ maxWidth: 680, mt: { sm: 8 }, borderRadius: { sm: 3 } }, noteSurfaceSx(draft.color)],
          },
          backdrop: { sx: { bgcolor: alpha(theme.palette.common.black, 0.4) } },
        }}
      >
        <NoteTitleRow
          title={draft.title}
          pinned={draft.pinned}
          readOnly={viewing}
          onTitle={(title) => set({ title })}
          onTogglePin={() => set({ pinned: !draft.pinned })}
          onMore={setMoreAnchor}
          onClose={n.saveAndClose}
        />

        <DialogContent sx={{ pt: 1.5, px: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            {!live && !readOnly && isBlank && (
              <NoteTypeToggle
                isList={isList}
                onChange={(v) =>
                  setDraft((d) => {
                    const next = changeType(d, v === "list" ? "checklist" : "text");
                    return v === "list" && next.checklist.length === 0
                      ? { ...next, checklist: [{ text: "", done: false }] }
                      : next;
                  })
                }
              />
            )}
            {live && (
              <Typography variant="caption" color="text.secondary">
                Edited {formatDistanceToNow(live.updated_at, { addSuffix: true })}
                {live.updated_by_name ? ` by ${live.updated_by_name}` : ""}
              </Typography>
            )}
            {viewing && !readOnly && (
              <Button variant="outlined" onClick={() => setEditing(true)} sx={{ alignSelf: "start" }}>
                Edit note
              </Button>
            )}
            {draft.type === "text" && !viewing && !source ? (
              <Suspense fallback={<ListSkeleton rows={4} />}>
                <NoteBlockEditor
                  key={note?._id ?? "new"}
                  body={draft.body}
                  onBody={(body) => set({ body })}
                  titles={titles}
                  noteId={live?._id ?? null}
                  onOpenNote={n.openLinked}
                  onSource={() => setSource(true)}
                />
              </Suspense>
            ) : (
              (draft.type === "text" || draft.type === "image") && (
                <NoteTextBody
                  type={draft.type}
                  body={draft.body}
                  onBody={(body) => set({ body })}
                  readOnly={viewing}
                  noteId={live?._id ?? null}
                  titles={titles}
                  onOpenNote={n.openLinked}
                  resetToken={n.initial}
                />
              )
            )}
            {source && !viewing && draft.type === "text" && (
              <Button onClick={() => setSource(false)}>Use block editor</Button>
            )}
            {isList && (
              <NoteChecklistEditor
                items={draft.checklist}
                viewing={viewing}
                readOnly={readOnly}
                autoFocusFirst={!live}
                onChange={(checklist) => set({ checklist })}
              />
            )}
            {draft.type === "link" && (
              <NoteLinkFields
                link={draft.link}
                error={linkError}
                readOnly={viewing}
                onChange={(link) => set({ link })}
              />
            )}
            {(draft.type === "image" || photoCount > 0) && (
              <NotePhotoGrid
                images={live?.images ?? []}
                pendingImages={draft.pendingImages}
                readOnly={viewing}
                onRemoveSaved={n.removePhoto}
                onRemovePending={(i) => set({ pendingImages: draft.pendingImages.filter((_, idx) => idx !== i) })}
              />
            )}
            {(draft.labels.length > 0 || draft.notebook_id) && (
              <NoteChips
                notebookName={
                  draft.notebook_id ? (notebooks.find((b) => b._id === draft.notebook_id)?.name ?? "Notebook") : null
                }
                labels={draft.labels}
                readOnly={viewing}
                onRemoveLabel={(label) => set({ labels: draft.labels.filter((l) => l !== label) })}
              />
            )}
            {live && <NoteBacklinks noteId={live._id} onOpenNote={n.openLinked} />}
          </Stack>
        </DialogContent>

        <NoteEditorToolbar
          readOnly={viewing}
          live={live}
          autosave={n.autosave}
          addingPhotos={n.addingPhotos}
          doneDisabled={n.saving || linkError}
          onAddPhotos={n.addPhotos}
          onColor={setColorAnchor}
          onLabels={setLabelAnchor}
          onNotebook={notebooks.length ? setBookAnchor : undefined}
          onReminder={setReminderAnchor}
          onShare={() => setShareOpen(true)}
          onDone={n.saveAndClose}
        />
      </Dialog>

      <NoteColorPopover
        anchor={colorAnchor}
        value={draft.color}
        onPick={(color) => {
          set({ color });
          setColorAnchor(null);
        }}
        onClose={() => setColorAnchor(null)}
      />

      <NoteLabelPopover
        anchor={labelAnchor}
        options={labelSuggestions}
        value={draft.labels}
        onChange={(labels) => set({ labels })}
        onClose={() => setLabelAnchor(null)}
      />

      <NoteNotebookMenu
        anchor={bookAnchor}
        notebooks={writableNotebooks}
        value={draft.notebook_id}
        onPick={(notebookId) => {
          set({ notebook_id: notebookId });
          setBookAnchor(null);
        }}
        onClose={() => setBookAnchor(null)}
      />

      <NoteMoreMenu
        anchor={moreAnchor}
        isList={isList}
        saved={!!live}
        archived={draft.archived}
        onToggleList={() => setDraft((d) => changeType(d, isList ? "text" : "checklist"))}
        onToggleArchived={() => set({ archived: !draft.archived })}
        onShare={() => setShareOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        onDelete={n.remove}
        onClose={() => setMoreAnchor(null)}
      />

      <NoteHistoryDialog
        open={historyOpen}
        noteId={live?._id ?? null}
        canRestore={!readOnly}
        onClose={() => setHistoryOpen(false)}
        // The note is different now, so the editor closes and the board shows it as it stands.
        onRestored={() => {
          setHistoryOpen(false);
          onClose();
        }}
      />

      <NoteReminderMenu
        anchor={reminderAnchor}
        onClose={() => setReminderAnchor(null)}
        reminder={live?.reminder ?? null}
        onSet={n.setReminder}
      />

      <NoteShareDialog noteId={shareOpen ? (live?._id ?? null) : null} onClose={() => setShareOpen(false)} />
    </>
  );
}
