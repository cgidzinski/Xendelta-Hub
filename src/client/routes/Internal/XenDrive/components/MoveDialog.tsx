import { useEffect, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { useXendriveBrowse } from "../../../../hooks/xendrive/useXendrive";

interface MoveDialogProps {
  open: boolean;
  /** What is being moved, for the title ("3 items", "report.pdf"). */
  label: string;
  /** The folders being moved: they can't be opened or chosen, since nothing can go inside itself. */
  folderIds: string[];
  /** Where the dialog opens, and where the things are now (moving there changes nothing). */
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => Promise<void>;
}

/** Pick the folder to move things into: open folders to look inside, then Move here. */
export default function MoveDialog({ open, label, folderIds, currentFolderId, onClose, onMove }: MoveDialogProps) {
  const [browsing, setBrowsing] = useState<string | null>(currentFolderId);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setBrowsing(currentFolderId);
  }, [open, currentFolderId]);

  const { data, isLoading, isError, error, refetch } = useXendriveBrowse(browsing);
  const subfolders = (data?.folders ?? []).filter((f) => !folderIds.includes(f._id));
  const trail = data?.breadcrumb ?? [];
  const where = browsing ? (data?.folder?.name ?? "this folder") : "My Drive";

  const move = async () => {
    setBusy(true);
    try {
      await onMove(browsing);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={`Move ${label}`}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={move} disabled={busy || isLoading || browsing === currentFolderId}>
            Move here
          </Button>
        </>
      }
    >
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" />} sx={{ mb: 1 }}>
        <Link component="button" type="button" underline="hover" color="inherit" onClick={() => setBrowsing(null)}>
          My Drive
        </Link>
        {trail.map((c, i) =>
          i === trail.length - 1 ? (
            <Typography key={c._id} color="text.primary">
              {c.name}
            </Typography>
          ) : (
            <Link
              key={c._id}
              component="button"
              type="button"
              underline="hover"
              color="inherit"
              onClick={() => setBrowsing(c._id)}
            >
              {c.name}
            </Link>
          ),
        )}
      </Breadcrumbs>
      <Box
        sx={{ border: 1, borderColor: "divider", borderRadius: 2, minHeight: 200, maxHeight: 320, overflowY: "auto" }}
      >
        {isError ? (
          <ErrorDisplay error={error ?? null} title="Couldn't load the folders" onRetry={() => refetch()} />
        ) : isLoading ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            Loading…
          </Typography>
        ) : subfolders.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            No folders in {where}.
          </Typography>
        ) : (
          <List disablePadding>
            {subfolders.map((f) => (
              <ListItemButton key={f._id} onClick={() => setBrowsing(f._id)}>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <FolderOutlinedIcon />
                </ListItemIcon>
                <ListItemText primary={f.name} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {browsing === currentFolderId ? "They are already in this folder." : `They will go into ${where}.`}
      </Typography>
    </ResponsiveDialog>
  );
}
