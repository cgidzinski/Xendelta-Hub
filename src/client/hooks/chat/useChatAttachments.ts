import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatAttachment } from "@shared/chat";
import { api } from "../../config/api";
import { uploadOne, type UploadSignal } from "../xendrive/useXendrive";
import { xendriveKeys } from "../xendrive/keys";
import { userProfileKeys } from "../user/useUserProfile";
import type { XenDriveFile } from "../../types/XenDriveFile";

export interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: "uploading" | "ready" | "error";
  percent: number;
  /** The XenDrive file, once it is stored (or when picked from the drive). */
  fileId?: string;
  error?: string;
  /** Picked from the drive: not ours to delete if the person changes their mind. */
  fromDrive?: boolean;
  signal?: UploadSignal;
}

const errorText = (e: any) =>
  e?.response?.status === 403
    ? "Not enough storage. Free up space or get more."
    : e?.response?.data?.message || e?.message || "Upload failed";

/**
 * The files being attached to the message in progress. Uploads go to XenDrive tagged as chat files (so they count
 * toward the sender's storage but stay out of My Drive); files picked from the drive are attached as they are.
 */
export function useChatAttachments(conversationId: string) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const queryClient = useQueryClient();
  const live = useRef(items);
  live.current = items;

  const patch = useCallback((id: string, change: Partial<PendingAttachment>) => {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }, []);

  const refreshUsage = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: xendriveKeys.recent() });
    queryClient.invalidateQueries({ queryKey: xendriveKeys.appFiles() });
    queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
  }, [queryClient]);

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const signal: UploadSignal = { cancelled: false };
        setItems((current) => [
          ...current,
          {
            id,
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            status: "uploading",
            percent: 0,
            signal,
          },
        ]);
        uploadOne({
          file,
          source: { app: "chat", ref: conversationId },
          signal,
          onProgress: (percent) => patch(id, { percent }),
        })
          .then((stored) => {
            patch(id, {
              status: "ready",
              percent: 100,
              fileId: stored._id,
              mimeType: stored.mimeType,
              size: stored.size,
            });
            refreshUsage();
          })
          .catch((e) => {
            if (!signal.cancelled) patch(id, { status: "error", error: errorText(e) });
          });
      }
    },
    [conversationId, patch, refreshUsage],
  );

  const addDriveFiles = useCallback((files: XenDriveFile[]) => {
    setItems((current) => [
      ...current,
      ...files
        .filter((f) => !current.some((i) => i.fileId === f._id))
        .map<PendingAttachment>((f) => ({
          id: `drive-${f._id}`,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
          status: "ready",
          percent: 100,
          fileId: f._id,
          fromDrive: true,
        })),
    ]);
  }, []);

  /** Take one away. An upload still going is cancelled; one already stored for this message is deleted again. */
  const remove = useCallback(
    (id: string) => {
      const item = live.current.find((i) => i.id === id);
      setItems((current) => current.filter((i) => i.id !== id));
      if (!item) return;
      if (item.status === "uploading" && item.signal) item.signal.cancelled = true;
      if (item.status === "ready" && item.fileId && !item.fromDrive) {
        api.delete(`/api/xendrive/files/${item.fileId}`).then(refreshUsage, () => undefined);
      }
    },
    [refreshUsage],
  );

  /** After a send: the files now belong to the message, so just forget them here. */
  const clear = useCallback(() => setItems([]), []);

  // Leaving the chat drops what was being attached, and cancels uploads still going.
  useEffect(
    () => () => {
      for (const i of live.current) {
        if (i.status === "uploading" && i.signal) i.signal.cancelled = true;
        if (i.status === "ready" && i.fileId && !i.fromDrive)
          api.delete(`/api/xendrive/files/${i.fileId}`).then(refreshUsage, () => undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId],
  );

  const ready = items.filter((i) => i.status === "ready" && i.fileId);
  const attachments: ChatAttachment[] = ready.map((i) => ({
    fileId: i.fileId!,
    name: i.name,
    mimeType: i.mimeType,
    size: i.size,
  }));

  return {
    items,
    attachments,
    busy: items.some((i) => i.status === "uploading"),
    failed: items.some((i) => i.status === "error"),
    addFiles,
    addDriveFiles,
    remove,
    clear,
  };
}
