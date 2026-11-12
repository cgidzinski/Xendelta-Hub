import { Alert, Box, Button, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { folderShareUrl, useXendriveActions } from "../../../../hooks/xendrive/useXendrive";
import type { XenDriveFolder } from "../../../../types/XenDriveFile";

interface FolderShareDialogProps {
  folder: XenDriveFolder | null;
  onClose: () => void;
}

/** Turn a folder's public link on or off, copy it, or replace it with a new one. */
export default function FolderShareDialog({ folder, onClose }: FolderShareDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { shareFolder } = useXendriveActions();
  // The folder prop is a snapshot from the list; the mutation result is the live state.
  const fresh = shareFolder.data?.folder;
  const live = fresh && folder && fresh._id === folder._id ? fresh : folder;
  const url = live?.shareToken ? folderShareUrl(live.shareToken) : null;
  const busy = shareFolder.isPending;

  const act = (action: "enable" | "rotate" | "disable") =>
    shareFolder.mutate(
      { folderId: folder!._id, action },
      { onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't update the link", { variant: "error" }) },
    );

  const rotate = async () => {
    const ok = await confirm({
      title: "Make a new link?",
      message: "The current link stops working for everyone who has it.",
      confirmLabel: "New link",
      destructive: false,
    });
    if (ok) act("rotate");
  };

  return (
    <ResponsiveDialog
      open={!!folder}
      onClose={onClose}
      maxWidth="sm"
      title={`Share "${folder?.name ?? ""}"`}
      actions={<Button onClick={onClose}>Done</Button>}
    >
      {url ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Alert severity="info">
            Anyone with this link can open this folder and everything inside it, and download the files. They can't
            change anything.
          </Alert>
          <TextField
            fullWidth
            value={url}
            label="Link"
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="Copy link"
                      edge="end"
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                        enqueueSnackbar("Link copied", { variant: "success" });
                      }}
                    >
                      <ContentCopyIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" onClick={rotate} disabled={busy}>
              Make a new link
            </Button>
            <Button variant="outlined" color="error" onClick={() => act("disable")} disabled={busy}>
              Stop sharing
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography color="text.secondary">
            This folder is private. Turn on a link to let anyone with it view and download what is inside.
          </Typography>
          <Box>
            <Button variant="contained" onClick={() => act("enable")} disabled={busy}>
              Create link
            </Button>
          </Box>
        </Box>
      )}
    </ResponsiveDialog>
  );
}
