import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type { AdminBackup, AdminBackupJob } from "@shared/admin";
import { adminKeys } from "./keys";

// Database backups (Admin > System). Backup and restore run on the server in the background, one at a time; this polls
// the job while it runs. A restore replaces everything, so when one ends every cached query is stale.

const POLL_MS = 2000;

export const useAdminBackups = () => {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: adminKeys.backups(),
    queryFn: async () => (await api.get<{ backups: AdminBackup[] }>("/api/admin/backups")).backups,
  });
  // Cheap to poll. While a restore runs the server answers this one request without signing in and 503s the rest.
  const job = useQuery({
    queryKey: adminKeys.backupJob(),
    queryFn: async () => (await api.get<{ job: AdminBackupJob | null }>("/api/admin/backups/job")).job,
    refetchInterval: (query) => (query.state.data?.status === "running" ? POLL_MS : false),
    retry: 5,
    retryDelay: POLL_MS,
  });

  // When a job finishes, refresh what it changed: the list of files, and everything after a restore.
  const finished = job.data && job.data.status !== "running" ? job.data : null;
  useEffect(() => {
    if (!finished) return;
    if (finished.kind === "restore") queryClient.invalidateQueries();
    else queryClient.invalidateQueries({ queryKey: adminKeys.all });
  }, [finished?.id, finished?.status, finished?.kind, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return { list, job };
};

export const useBackupActions = () => {
  const queryClient = useQueryClient();
  const started = (data: { job: AdminBackupJob }) => queryClient.setQueryData(adminKeys.backupJob(), data.job);

  const createBackup = useMutation({
    mutationFn: () => api.post<{ job: AdminBackupJob }>("/api/admin/backups"),
    onSuccess: started,
  });
  const restoreBackup = useMutation({
    mutationFn: (name: string) =>
      api.post<{ job: AdminBackupJob }>("/api/admin/backups/restore", { name, confirm: "RESTORE" }),
    onSuccess: started,
  });
  const deleteBackup = useMutation({
    mutationFn: (name: string) => api.delete("/api/admin/backups", { data: { name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
  const downloadBackup = useMutation({
    mutationFn: async (name: string) =>
      (await api.get<{ url: string }>("/api/admin/backups/download", { params: { name } })).url,
    onSuccess: (url) => window.open(url, "_blank", "noopener"),
  });

  return { createBackup, restoreBackup, deleteBackup, downloadBackup };
};
