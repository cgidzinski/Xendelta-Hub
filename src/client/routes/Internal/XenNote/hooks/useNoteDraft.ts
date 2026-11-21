import { useEffect, useMemo, useRef, useState } from "react";
import { useSnackbar } from "notistack";
import { isSafeUrl, type NoteType } from "@shared/xennote/notes";
import { useXenNoteActions } from "../../../../hooks/xennote/useXenNote";
import type { XenNote } from "../../../../types/XenNote";
import { draftFromNote, emptyDraft, isDirty, isEmptyDraft, toInput, type NoteDraft } from "../noteDraft";

const AUTOSAVE_MS = 800;

interface UseNoteDraftOptions {
  open: boolean;
  onClose: () => void;
  /** The note to edit; null starts a new one. */
  note: XenNote | null;
  startType?: NoteType;
  onOpenNote?: (id: string) => void;
}

/**
 * The state behind the note editor: the draft being typed, the note as the server holds it (`live`), autosave,
 * saving on close, and the actions that change the note outside the draft (photos and reminders).
 */
export function useNoteDraft({ open, onClose, note, startType, onOpenNote }: UseNoteDraftOptions) {
  const { enqueueSnackbar } = useSnackbar();
  const actions = useXenNoteActions();

  const initial = useMemo(
    () =>
      note
        ? draftFromNote(note)
        : emptyDraft({
            type: startType ?? "text",
            checklist: startType === "checklist" ? [{ text: "", done: false }] : [],
          }),
    // The draft is reset each time the dialog opens, for a given note or a fresh start
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, note?._id, startType],
  );
  const [draft, setDraft] = useState<NoteDraft>(initial);
  const [saving, setSaving] = useState(false);
  // Autosave state for an existing note: shown beside Done as "Saving…" then "Saved"
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved">("idle");
  // What the server holds for this note right now (photos and the link change it outside the draft).
  const [live, setLive] = useState<XenNote | null>(note);
  const pendingSave = useRef<Promise<XenNote> | null>(null);

  const saveExisting = async (savedNote: XenNote, nextDraft: NoteDraft) => {
    const request = actions.updateNote.mutateAsync({ id: savedNote._id, input: toInput(nextDraft) });
    pendingSave.current = request;
    try {
      const saved = await request;
      setLive((current) => (current?._id === saved._id ? { ...current, ...saved } : current));
      return saved;
    } finally {
      if (pendingSave.current === request) pendingSave.current = null;
    }
  };

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
    if (!open || saving || readOnly || !live || pendingSave.current || !isDirty(draft, draftFromNote(live))) return;
    if (draft.type === "link" && draft.link.url.trim() !== "" && !isSafeUrl(draft.link.url.trim())) return;
    const timer = setTimeout(async () => {
      setAutosave("saving");
      try {
        await saveExisting(live, draft);
        setAutosave("saved");
      } catch (e) {
        setAutosave("idle");
        enqueueSnackbar((e as Error).message || "Couldn't save the note", { variant: "error" });
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, live, open, readOnly, saving]);
  useEffect(() => {
    if (open) setAutosave("idle");
  }, [open, initial]);

  // Save what is in the editor (a new note is created, a changed one updated). False if it couldn't be saved, in which
  // case the editor stays as it is so nothing typed is lost.
  const persist = async (): Promise<boolean> => {
    if (saving) return false;
    try {
      setSaving(true);
      if (!live) {
        if (!isEmptyDraft(draft)) {
          const created = await actions.createNote.mutateAsync(toInput(draft));
          if (draft.pendingImages.length)
            await actions.addImages.mutateAsync({ id: created._id, files: draft.pendingImages });
        }
      } else {
        // A close while autosave is in flight must finish that write before flushing a newer draft.
        const saved = await pendingSave.current?.catch(() => null);
        const baseline = saved?._id === live._id ? saved : live;
        if (isDirty(draft, draftFromNote(baseline))) await saveExisting(baseline, draft);
      }
      return true;
    } catch (e) {
      // Stay open so nothing typed is lost; say what to fix
      enqueueSnackbar((e as Error).message || "Couldn't save the note", { variant: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndClose = async () => {
    if (readOnly) return onClose();
    if (await persist()) onClose();
  };

  // Go to another note (a [[link]], or one under "Linked from"), saving this one first.
  const openLinked = async (id: string) => {
    if (id === live?._id) return;
    if (readOnly || (await persist())) onOpenNote?.(id);
  };

  // My reminder on this note. Personal, so it works on a note I can only view too; it isn't part of the draft.
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

  const addPhotos = async (files: ArrayLike<File> | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    if (!live) return set({ pendingImages: [...draft.pendingImages, ...list] });
    try {
      setLive(await actions.addImages.mutateAsync({ id: live._id, files: list }));
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't add the photos", { variant: "error" });
    }
  };

  const removePhoto = async (imageId: string) => {
    if (!live) return;
    try {
      setLive(await actions.removeImage.mutateAsync({ id: live._id, imageId }));
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't remove the photo", { variant: "error" });
    }
  };

  return {
    initial,
    draft,
    setDraft,
    set,
    live,
    readOnly,
    saving,
    autosave,
    addingPhotos: actions.addImages.isPending,
    saveAndClose,
    openLinked,
    setReminder,
    addPhotos,
    removePhoto,
  };
}
