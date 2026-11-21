import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import type { Editor } from "@tiptap/core";
import { api } from "../../../../config/api";
import { useAuth } from "../../../../contexts/AuthContext";
import { savePageBody } from "../../../../hooks/xennote/usePages";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import { useSocketEvent } from "../../../../hooks/useSocketEvent";
import type { XenNotePageDetail } from "../../../../types/XenNotePage";
import { draftLabel, initialDraft, reduceDraft, remoteAction, type DraftEvent, type DraftState } from "./pageDraft";

const SAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 5000;

interface Options {
  pageId: string;
  initialRev: number;
  editor: Editor | null;
  editable: boolean;
}

/**
 * Keeps a page's text saved while it is typed: saves 800 ms after typing pauses, when the tab is hidden and when the page
 * closes, and retries a failed save. When somebody else saves the same page it takes their text quietly if nothing is
 * unsaved here, and otherwise offers a choice (`remote`). The rules are in pageDraft.ts.
 */
export function usePageDraft({ pageId, initialRev, editor, editable }: Options) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [state, setState] = useReducer((_: DraftState, next: DraftState) => next, initialRev, initialDraft);
  // The latest state and editor, readable from timers and async work without stale values.
  const stateRef = useRef(state);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Names this editor in the realtime event for its saves, so it can tell them from another tab's.
  const clientId = useRef(crypto.randomUUID());

  const dispatch = useCallback((event: DraftEvent) => {
    stateRef.current = reduceDraft(stateRef.current, event);
    setState(stateRef.current);
  }, []);

  const schedule = useCallback((ms: number, run: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, ms);
  }, []);

  const save = useCallback(async (): Promise<void> => {
    const ed = editorRef.current;
    if (!ed || !stateRef.current.dirty || stateRef.current.saving) return;
    dispatch({ type: "saveStarted" });
    try {
      const result = await savePageBody(pageId, ed.getJSON(), stateRef.current.rev, clientId.current);
      dispatch({ type: "saved", rev: result.rev });
      if (result.conflict) {
        enqueueSnackbar("Saved. It replaced a newer version, which is kept in the page's history.", {
          variant: "info",
        });
      }
      // Typing went on while saving: save again.
      if (stateRef.current.dirty) schedule(SAVE_DELAY_MS, () => void save());
    } catch (e) {
      dispatch({ type: "saveFailed" });
      enqueueSnackbar((e as Error).message || "Couldn't save this page", { variant: "error" });
      schedule(RETRY_DELAY_MS, () => void save());
    }
  }, [pageId, dispatch, schedule, enqueueSnackbar]);

  /** Call whenever the text changes. */
  const edited = useCallback(() => {
    if (!editable) return;
    dispatch({ type: "edit" });
    schedule(SAVE_DELAY_MS, () => void save());
  }, [editable, dispatch, schedule, save]);

  /** Save now, if anything is unsaved. */
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    return save();
  }, [save]);

  // Save when the tab is hidden and when leaving the page; warn before closing the tab with unsaved text.
  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (stateRef.current.dirty || stateRef.current.saving) e.preventDefault();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  /** Replace what is shown with the saved version (after someone else's save). */
  const reload = useCallback(async () => {
    const fresh = await api.get<XenNotePageDetail>(`/api/xennote/pages/${pageId}`);
    queryClient.setQueryData(xennoteKeys.page(pageId), fresh);
    editorRef.current?.commands.setContent(fresh.doc, { emitUpdate: false });
    dispatch({ type: "reloaded", rev: fresh.page.rev });
  }, [pageId, queryClient, dispatch]);

  useSocketEvent<{ pageId: string; rev: number; by: string; client?: string }>("xennote:page_update", (event) => {
    if (event.pageId !== pageId) return;
    const action = remoteAction(stateRef.current, event, clientId.current);
    if (action === "reload") void reload().catch(() => undefined);
    else if (action === "warn") dispatch({ type: "remote", rev: event.rev, by: event.by });
  });

  return {
    state,
    label: draftLabel(state),
    /** Whether the newer save that is being warned about was by this same person (another tab or device). */
    remoteIsMe: state.remote?.by === user.id,
    edited,
    flush,
    reload,
    keepMine: () => dispatch({ type: "keepMine" }),
  };
}
