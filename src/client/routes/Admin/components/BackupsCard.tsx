import { useState } from "react";
import { Box, Button, Chip, IconButton, LinearProgress, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import RestoreIcon from "@mui/icons-material/Restore";
import { useSnackbar } from "notistack";
import type { AdminBackup } from "@shared/admin";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useAdminBackups, useBackupActions } from "../../../hooks/admin/useBackups";
import { formatFileSize } from "../../../utils/fileUtils";
import { timeAgo } from "../adminFormat";
import TypedConfirmDialog from "./TypedConfirmDialog";

const card = { border: 1, borderColor: "divider", borderRadius: 2, p: 2.25 } as const;
// "db-backups/xendelta-hub-backup-2026-01-01T00-00-00-000Z.ndjson.gz" -> "2026-01-01 00:00 UTC"
const label = (b: AdminBackup) => {
  const m = b.name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
  return m ? `${m[1]} ${m[2]}:${m[3]} UTC` : b.name;
};
const errorMessage = (e: unknown, fallback: string) => (e as { message?: string })?.message || fallback;

/** Back up the database to the private bucket, download or delete a backup, or restore from one. */
export default function BackupsCard() {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { list, job } = useAdminBackups();
  const { createBackup, restoreBackup, deleteBackup, downloadBackup } = useBackupActions();
  const [restoring, setRestoring] = useState<AdminBackup | null>(null);

  const running = job.data?.status === "running" ? job.data : null;
  const last = job.data && job.data.status !== "running" ? job.data : null;
  const busy = !!running || createBackup.isPending || restoreBackup.isPending;

  const run = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
    } catch (e) {
      enqueueSnackbar(errorMessage(e, failure), { variant: "error" });
    }
  };

  const remove = async (b: AdminBackup) => {
    const ok = await confirm({
      title: "Delete this backup?",
      message: `${label(b)} will be deleted from storage. This can't be undone.`,
    });
    if (ok) await run(() => deleteBackup.mutateAsync(b.name), "Couldn't delete the backup");
  };

  return (
    <Box sx={card}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontWeight: 600 }}>Database backups</Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() => run(() => createBackup.mutateAsync(), "Couldn't start the backup")}
        >
          Back up now
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Saved to private storage. A restore replaces everything with the backup, after saving a safety copy of what is
        there now.
      </Typography>

      {running && (
        <Box sx={{ mt: 1.5 }} role="status">
          <LinearProgress sx={{ height: 6, borderRadius: 3 }} />
          <Typography variant="body2" sx={{ mt: 0.75 }}>
            {running.kind === "restore"
              ? "Restoring. The app is paused for everyone until this finishes."
              : "Backing up the database…"}
          </Typography>
        </Box>
      )}
      {last?.status === "error" && (
        <Typography variant="body2" color="error.main" sx={{ mt: 1.5 }} role="alert">
          {last.kind === "restore" ? "Restore" : "Backup"} failed: {last.error}
        </Typography>
      )}
      {last?.status === "done" && last.kind === "restore" && last.summary && (
        <Typography variant="body2" color="success.main" sx={{ mt: 1.5 }} role="status">
          Restored {last.summary.inserted} documents in {last.summary.collections} collections.
          {last.summary.errors.length > 0 && ` ${last.summary.errors.length} collections had errors.`}
        </Typography>
      )}

      <Box sx={{ mt: 1.5 }}>
        {list.isError && (
          <Typography variant="body2" color="error.main">
            Couldn't load the backups.
          </Typography>
        )}
        {list.data?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No backups yet.
          </Typography>
        )}
        {list.data?.map((b) => (
          <Box
            key={b.name}
            sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75, borderTop: 1, borderColor: "divider" }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {label(b)}
                {b.kind === "scheduled" && (
                  <Chip size="small" label="automatic" variant="outlined" sx={{ ml: 1, height: 20 }} />
                )}
                {b.kind === "pre-restore" && (
                  <Chip size="small" label="safety copy" variant="outlined" sx={{ ml: 1, height: 20 }} />
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(b.size)}
                {b.createdAt ? ` · ${timeAgo(b.createdAt)}` : ""}
              </Typography>
            </Box>
            <Tooltip title="Download">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Download backup from ${label(b)}`}
                  disabled={downloadBackup.isPending}
                  onClick={() => run(() => downloadBackup.mutateAsync(b.name), "Couldn't get the download link")}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Restore">
              <span>
                <IconButton
                  size="small"
                  color="warning"
                  aria-label={`Restore the backup from ${label(b)}`}
                  disabled={busy}
                  onClick={() => setRestoring(b)}
                >
                  <RestoreIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Delete the backup from ${label(b)}`}
                  disabled={deleteBackup.isPending}
                  onClick={() => remove(b)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ))}
      </Box>

      <TypedConfirmDialog
        open={!!restoring}
        onClose={() => setRestoring(null)}
        title="Restore the database"
        message={`This replaces everything in the database with the backup from ${restoring ? label(restoring) : ""}. Anything added since then is lost, though a safety copy is saved first. The app is paused for everyone while it runs, and people who joined after the backup was taken will lose their accounts.`}
        phrase="RESTORE"
        confirmLabel="Restore"
        busy={restoreBackup.isPending}
        onConfirm={async () => {
          if (!restoring) return;
          await run(() => restoreBackup.mutateAsync(restoring.name), "Couldn't start the restore");
          setRestoring(null);
        }}
      />
    </Box>
  );
}
