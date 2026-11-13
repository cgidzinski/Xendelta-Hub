import { Box, Button, InputAdornment, Stack, Switch, TextField, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import LinkIcon from "@mui/icons-material/Link";
import { alpha } from "@mui/material/styles";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { folderShareUrl, useXendriveActions, useXendriveFolderStats } from "../../../../hooks/xendrive/useXendrive";
import type { XenDriveFolder } from "../../../../types/XenDriveFile";
import { folderContentsLabel } from "../lib/driveFormat";
import DownloadTally from "./DownloadTally";
import LinkExpiryPicker from "./LinkExpiryPicker";
import LinkPasswordField from "./LinkPasswordField";

interface FolderShareDialogProps {
  /** The folder being shared, kept current by the page behind. */
  folder: XenDriveFolder | null;
  onClose: () => void;
}

/** Turn a folder's public link on or off, copy it, replace it, and see exactly what people would be able to see. */
export default function FolderShareDialog({ folder, onClose }: FolderShareDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { shareFolder, updateFolderShare } = useXendriveActions();
  const { data: stats } = useXendriveFolderStats(folder?._id ?? null);

  // The page behind refetches after each change; the mutation result is a fallback until it has
  const fresh = updateFolderShare.data?.folder ?? shareFolder.data?.folder;
  const live = fresh && folder && fresh._id === folder._id ? { ...folder, ...fresh } : folder;
  const url = live?.shareToken ? folderShareUrl(live.shareToken) : null;
  const on = !!url;
  const busy = shareFolder.isPending || updateFolderShare.isPending;

  const act = (action: "enable" | "rotate" | "disable") =>
    shareFolder.mutate(
      { folderId: folder!._id, action },
      { onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't update the link", { variant: "error" }) },
    );

  const saveSettings = (settings: { password?: string | null; expiry?: string | null }, message?: string) =>
    updateFolderShare.mutate(
      { folderId: folder!._id, settings },
      {
        onSuccess: () => message && enqueueSnackbar(message, { variant: "success" }),
        onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't save", { variant: "error" }),
      },
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

  const stop = async () => {
    const ok = await confirm({
      title: "Stop sharing this folder?",
      message: "Its link stops working right away.",
      confirmLabel: "Stop sharing",
    });
    if (ok) act("disable");
  };

  return (
    <ResponsiveDialog
      open={!!folder}
      onClose={onClose}
      maxWidth="sm"
      title={`Share “${folder?.name ?? ""}”`}
      actions={<Button onClick={onClose}>Done</Button>}
    >
      <Stack spacing={2.5}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.75, pb: 2, borderBottom: 1, borderColor: "divider" }}>
          <Box
            sx={(t) => ({
              width: 40,
              height: 40,
              borderRadius: 2.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t.palette.primary.main,
              bgcolor: alpha(t.palette.primary.main, 0.16),
            })}
          >
            <LinkIcon />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 500 }}>Anyone with the link</Typography>
            <Typography variant="body2" color="text.secondary">
              Can view and download. Can’t change anything.
            </Typography>
          </Box>
          <Switch
            checked={on}
            disabled={busy}
            onChange={(e) => (e.target.checked ? act("enable") : stop())}
            slotProps={{ input: { "aria-label": "Folder link" } }}
          />
        </Box>

        {on && url && (
          <>
            <TextField
              fullWidth
              value={url}
              slotProps={{
                htmlInput: { readOnly: true, "aria-label": "Folder link" },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          enqueueSnackbar("Link copied", { variant: "success" });
                        }}
                      >
                        Copy link
                      </Button>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Box sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: "divider" }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                What people can see
              </Typography>
              <Stack spacing={0.75}>
                <Line ok>
                  {stats ? folderContentsLabel(stats) : "Everything in this folder"}, including everything added later
                </Line>
                <Line ok>Files with their own password or link off can still be downloaded through it</Line>
                <Line>Nothing above “{folder?.name}” and nobody’s name</Line>
              </Stack>
            </Box>

            <LinkPasswordField
              resetKey={live!._id}
              hasPassword={!!live?.hasPassword}
              busy={busy}
              onSave={(password) => saveSettings({ password }, "Password saved")}
              onRemove={() => saveSettings({ password: null }, "Password removed")}
            />

            <LinkExpiryPicker expiry={live?.expiry} onChange={(expiry, message) => saveSettings({ expiry }, message)} />

            <DownloadTally downloads={live?.downloads} last={live?.lastDownloadedAt} />

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={rotate} disabled={busy}>
                Make a new link
              </Button>
              <Button variant="outlined" color="error" onClick={stop} disabled={busy}>
                Stop sharing
              </Button>
            </Box>
          </>
        )}
        {!on && (
          <Typography color="text.secondary">
            This folder is private. Turn the link on to let anyone with it open this folder and everything inside it.
          </Typography>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}

function Line({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: ok ? "text.primary" : "text.secondary" }}>
      {ok ? <CheckIcon fontSize="small" color="success" /> : <CloseIcon fontSize="small" />}
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}
