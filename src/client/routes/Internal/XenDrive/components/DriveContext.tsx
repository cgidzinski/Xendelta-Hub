import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCancelled, uploadOne, type UploadSignal } from "../../../../hooks/xendrive/useXendrive";
import { xendriveKeys } from "../../../../hooks/xendrive/keys";
import { nextWaiting, summarize, uploadReducer, type UploadItem, type UploadSummary } from "../lib/uploadQueue";

/** Where files go when they are dropped on the page or chosen from the New menu. */
export interface UploadTarget {
  folderId: string | null;
  name: string;
}

interface DriveContextValue {
  items: UploadItem[];
  summary: UploadSummary;
  /** Queue files for upload into a folder (null = the top level). */
  add: (files: File[], folderId: string | null) => void;
  retry: (id: number) => void;
  cancel: (id: number) => void;
  cancelAll: () => void;
  clear: () => void;
  /** Open the system file picker, then upload what is chosen into `folderId`. */
  pickFiles: (folderId: string | null) => void;
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  /** The page says where it is, so a drop on the page knows where to put files. */
  target: UploadTarget;
  setTarget: (target: UploadTarget) => void;
  /** The sidebar's New menu asks the open page to show its New folder dialog. */
  newFolderTick: number;
  requestNewFolder: () => void;
}

const DriveContext = createContext<DriveContextValue | null>(null);

export function useDrive(): DriveContextValue {
  const ctx = useContext(DriveContext);
  if (!ctx) throw new Error("useDrive must be used inside DriveProvider");
  return ctx;
}

/**
 * The upload queue for the whole drive. It lives above the pages, so an upload keeps going while you
 * open folders or a file, and files go one at a time, in the order they were added.
 */
export function DriveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [items, dispatch] = useReducer(uploadReducer, []);
  const [minimized, setMinimized] = useState(false);
  const [target, setTarget] = useState<UploadTarget>({ folderId: null, name: "My Drive" });
  const [newFolderTick, setNewFolderTick] = useState(0);
  const files = useRef(new Map<number, File>());
  const signals = useRef(new Map<number, UploadSignal>());
  const nextId = useRef(0);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: xendriveKeys.all });
    queryClient.invalidateQueries({ queryKey: ["userProfile"] });
  }, [queryClient]);

  const add = useCallback((list: File[], folderId: string | null) => {
    if (list.length === 0) return;
    const entries = list.map((file) => {
      const id = nextId.current++;
      files.current.set(id, file);
      return { id, name: file.name, size: file.size, folderId, mimeType: file.type };
    });
    dispatch({ type: "add", items: entries });
    setMinimized(false);
  }, []);

  // The runner: when nothing is uploading, start the next waiting file
  useEffect(() => {
    if (items.some((i) => i.status === "uploading")) return;
    const next = nextWaiting(items);
    const file = next && files.current.get(next.id);
    if (!next || !file) return;

    const signal: UploadSignal = { cancelled: false };
    signals.current.set(next.id, signal);
    dispatch({ type: "start", id: next.id });
    uploadOne({
      file,
      folderId: next.folderId,
      signal,
      onProgress: (percent) => dispatch({ type: "progress", id: next.id, percent }),
    })
      .then(() => dispatch({ type: "done", id: next.id }))
      .catch((e: unknown) => {
        // A cancelled upload was already marked cancelled by the person who cancelled it
        if (!(e instanceof UploadCancelled))
          dispatch({ type: "fail", id: next.id, error: (e as Error).message || "Upload failed" });
      })
      .finally(() => {
        signals.current.delete(next.id);
        refresh();
      });
  }, [items, refresh]);

  const cancel = useCallback((id: number) => {
    const signal = signals.current.get(id);
    if (signal) signal.cancelled = true;
    dispatch({ type: "cancel", id });
  }, []);

  const cancelAll = useCallback(() => {
    items.filter((i) => i.status === "waiting" || i.status === "uploading").forEach((i) => cancel(i.id));
  }, [items, cancel]);

  const clear = useCallback(() => {
    files.current.clear();
    dispatch({ type: "clear" });
  }, []);

  const pickFiles = useCallback(
    (folderId: string | null) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () => add(Array.from(input.files ?? []), folderId);
      input.click();
    },
    [add],
  );

  const value = useMemo<DriveContextValue>(
    () => ({
      items,
      summary: summarize(items),
      add,
      retry: (id) => dispatch({ type: "retry", id }),
      cancel,
      cancelAll,
      clear,
      pickFiles,
      minimized,
      setMinimized,
      target,
      setTarget,
      newFolderTick,
      requestNewFolder: () => setNewFolderTick((n) => n + 1),
    }),
    [items, add, cancel, cancelAll, clear, pickFiles, minimized, target, newFolderTick],
  );

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}
