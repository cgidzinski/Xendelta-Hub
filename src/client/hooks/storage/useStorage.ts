import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import { liveQuery } from "../liveQuery";
import type { AppFilesResult, XenDriveFile } from "../../types/XenDriveFile";
import { storageKeys } from "./keys";

interface StorageFileResult {
  file: XenDriveFile;
  /** A short-lived link to show the file in the page, for images, PDFs, video and audio. */
  previewUrl: string | null;
  /** For videos with a poster: the cacheable link the player shows before it plays. */
  posterUrl: string | null;
}

/** Everything apps have stored on the person's behalf, grouped by app and by where it came from. */
export const useStorageAppFiles = (enabled = true) =>
  useQuery({
    queryKey: storageKeys.appFiles(),
    queryFn: () => api.get<AppFilesResult>("/api/storage/app-files"),
    enabled,
    ...liveQuery,
  });

/** One app-stored file (the storage viewer's file page). */
export const useStorageFile = (fileId: string | undefined) =>
  useQuery({
    queryKey: storageKeys.file(fileId),
    queryFn: () => api.get<StorageFileResult>(`/api/storage/files/${fileId}`),
    enabled: !!fileId,
    retry: false,
    ...liveQuery,
  });

/** The first ~256 KB of a text-like app-stored file, shown in the page instead of its icon. */
export const useStorageFileText = (fileId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...storageKeys.file(fileId), "text"],
    queryFn: () => api.get<{ text: string; truncated: boolean }>(`/api/storage/files/${fileId}/text`),
    enabled: !!fileId && enabled,
    retry: false,
    ...liveQuery,
  });

/** Delete an app-stored file and refresh the viewer and the profile usage. */
export const useStorageActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: storageKeys.all });
    queryClient.invalidateQueries({ queryKey: ["userProfile"] });
  };

  const deleteFile = useMutation({
    mutationFn: (fileId: string) => api.delete(`/api/storage/files/${fileId}`),
    onSuccess: refresh,
  });

  return { deleteFile };
};

/** Save an app-stored file to the computer under its real name. */
export async function downloadStorageFile(fileId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/api/storage/files/${fileId}/url?download=1`);
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Open the original file at full size in a new tab (the page shows a smaller rendition for images). */
export async function openOriginalStorageFile(fileId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/api/storage/files/${fileId}/url`);
  window.open(url, "_blank", "noopener,noreferrer");
}
