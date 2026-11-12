import { useEffect, useState } from "react";
import { Box, Button, Skeleton, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useXendriveFolderStats } from "../../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../../utils/fileUtils";
import type { XenDriveFolder } from "../../../../types/XenDriveFile";
import { folderContentsLabel } from "../lib/driveFormat";

/** A folder holding more than this many things asks you to type its name before it is deleted. */
export const TYPE_NAME_THRESHOLD = 5;

interface DeleteFolderDialogProps {
  folder: XenDriveFolder | null;
  onClose: () => void;
  onConfirm: (folder: XenDriveFolder) => Promise<void>;
}

/** Says exactly what deleting a folder takes with it, and for a big folder asks for its name first. */
export default function DeleteFolderDialog({ folder, onClose, onConfirm }: DeleteFolderDialogProps) {
  const { data: stats, isLoading } = useXendriveFolderStats(folder?._id ?? null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setTyped(""), [folder?._id]);

  const total = stats ? stats.files + stats.folders : 0;
  const mustType = total > TYPE_NAME_THRESHOLD;
  const ready = !!stats && !deleting && (!mustType || typed.trim() === folder?.name);

  const confirm = async () => {
    if (!folder) return;
    setDeleting(true);
    try {
      await onConfirm(folder);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ResponsiveDialog
      open={!!folder}
      onClose={onClose}
      maxWidth="xs"
      title={`Delete "${folder?.name ?? ""}"?`}
      actions={
        <>
          <Button onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={confirm} disabled={!ready}>
            {deleting ? "Deleting..." : "Delete folder"}
          </Button>
        </>
      }
    >
      {isLoading || !stats ? (
        <Skeleton variant="rounded" height={64} />
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              p: 1.75,
              borderRadius: 2,
              border: 1,
              borderColor: "error.main",
              bgcolor: (t) => (total === 0 ? "transparent" : alpha(t.palette.error.main, 0.1)),
              mb: 2,
            }}
          >
            <WarningAmberIcon color="error" />
            <Box>
              <Typography sx={{ fontWeight: 500 }}>
                {total === 0 ? "This folder is empty" : `${folderContentsLabel(stats)} (${formatFileSize(stats.size)})`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {total === 0 ? "Nothing else is lost." : "will be deleted for good."}
              </Typography>
            </Box>
          </Box>
          <Typography color="text.secondary">
            {folder?.shared ? "Its public link stops working right away. " : ""}This can’t be undone.
          </Typography>
          {mustType && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Type <b>{folder?.name}</b> to confirm
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                slotProps={{ htmlInput: { "aria-label": "Type the folder name to confirm" } }}
              />
            </Box>
          )}
        </>
      )}
    </ResponsiveDialog>
  );
}
