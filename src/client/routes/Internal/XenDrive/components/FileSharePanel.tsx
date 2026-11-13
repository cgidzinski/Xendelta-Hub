import { Box, Button, InputAdornment, Stack, Switch, TextField, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { fileShareUrl, useXendriveActions } from "../../../../hooks/xendrive/useXendrive";
import type { XenDriveFile } from "../../../../types/XenDriveFile";
import DownloadTally from "./DownloadTally";
import LinkExpiryPicker from "./LinkExpiryPicker";
import LinkPasswordField from "./LinkPasswordField";

/**
 * Everything about a file's public link: the on/off switch, the address, a password, and when it stops
 * working. Each change saves at once. Used on the file page and in the Share dialog.
 */
export default function FileSharePanel({ file }: { file: XenDriveFile }) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { updateFileSettings, rotateFileLink } = useXendriveActions();
  const busy = updateFileSettings.isPending || rotateFileLink.isPending;

  const save = (settings: Parameters<typeof updateFileSettings.mutate>[0]["settings"], message?: string) =>
    updateFileSettings.mutate(
      { fileId: file._id, settings },
      {
        onSuccess: () => message && enqueueSnackbar(message, { variant: "success" }),
        onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't save", { variant: "error" }),
      },
    );

  const url = file.shareToken ? fileShareUrl(file.shareToken) : "";

  const newLink = async () => {
    const ok = await confirm({
      title: "Make a new link?",
      message: "The current link stops working for everyone who has it.",
      confirmLabel: "New link",
      destructive: false,
    });
    if (!ok) return;
    rotateFileLink.mutate(file._id, {
      onSuccess: () => enqueueSnackbar("New link made", { variant: "success" }),
      onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't make a new link", { variant: "error" }),
    });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <SectionLabel>Share</SectionLabel>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 500 }}>
              {file.shared ? "Anyone with the link can download" : "Only you can see this file"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {file.shared ? "Turn off to stop sharing this file." : "Turn on to get a link you can send."}
            </Typography>
          </Box>
          <Switch
            checked={file.shared}
            disabled={busy}
            onChange={(e) => save({ shareEnabled: e.target.checked }, e.target.checked ? "Link is on" : "Link is off")}
            slotProps={{ input: { "aria-label": "Link sharing" } }}
          />
        </Box>

        {file.shared && (
          <>
            <TextField
              fullWidth
              size="small"
              value={url}
              aria-label="Share link"
              slotProps={{
                htmlInput: { readOnly: true, "aria-label": "Share link" },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<ContentCopyIcon />}
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          enqueueSnackbar("Link copied", { variant: "success" });
                        }}
                      >
                        Copy
                      </Button>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button size="small" onClick={newLink} disabled={busy} sx={{ mt: 1, px: 0 }}>
              Make a new link
            </Button>
          </>
        )}
      </Box>

      <LinkPasswordField
        resetKey={file._id}
        hasPassword={!!file.hasPassword}
        busy={busy}
        onSave={(password) => save({ password }, "Password saved")}
        onRemove={() => save({ password: null }, "Password removed")}
      />

      <LinkExpiryPicker expiry={file.expiry} onChange={(expiry, message) => save({ expiry }, message)} />

      {file.shared && <DownloadTally downloads={file.downloads} last={file.lastDownloadedAt} />}
    </Stack>
  );
}
