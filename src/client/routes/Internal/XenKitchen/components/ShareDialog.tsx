import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import IosShareIcon from "@mui/icons-material/IosShare";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { shareUrlFor, useShareKitchenItem, type KitchenItem } from "../../../../hooks/xenkitchen/useKitchen";

export default function ShareDialog({
  item,
  open,
  onClose,
}: {
  item: KitchenItem;
  open: boolean;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const share = useShareKitchenItem();
  const [busy, setBusy] = useState(false);
  const enabled = !!item.share?.enabled;
  const url = item.share?.token ? shareUrlFor(item.share.token) : "";

  const run = async (action: "enable" | "disable" | "rotate") => {
    setBusy(true);
    try {
      await share.mutateAsync({ id: item._id, action });
      if (action === "rotate") enqueueSnackbar("New link made — the old one no longer works", { variant: "success" });
    } catch {
      enqueueSnackbar("Couldn't update sharing", { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      enqueueSnackbar("Link copied", { variant: "success" });
    } catch {
      enqueueSnackbar("Couldn't copy — select the link and copy it", { variant: "warning" });
    }
  };

  const nativeShare = () => navigator.share?.({ title: item.title, url }).catch(() => {});

  const rotate = async () => {
    if (
      await confirm({
        title: "Reset the link?",
        message: "Anyone with the current link will lose access. You'll get a new link to share.",
        confirmLabel: "Reset link",
      })
    ) {
      run("rotate");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>Share "{item.title || "Untitled"}"</DialogTitle>
      <DialogContent>
        <FormControlLabel
          control={
            <Switch checked={enabled} disabled={busy} onChange={(e) => run(e.target.checked ? "enable" : "disable")} />
          }
          label="Anyone with the link can view"
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          They'll see a read-only page — no account needed. Your favorites and notes about who you are stay private.
        </Typography>
        {enabled && url && (
          <Stack spacing={1.5}>
            <TextField
              value={url}
              fullWidth
              size="small"
              onFocus={(e) => e.target.select()}
              slotProps={{
                input: {
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Copy">
                        <IconButton edge="end" onClick={copy} aria-label="Copy link">
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {typeof navigator.share === "function" && (
                <Button variant="contained" startIcon={<IosShareIcon />} onClick={nativeShare}>
                  Share…
                </Button>
              )}
              <Button
                variant={typeof navigator.share === "function" ? "outlined" : "contained"}
                startIcon={<ContentCopyIcon />}
                onClick={copy}
              >
                Copy link
              </Button>
              <Button color="inherit" startIcon={<RefreshIcon />} onClick={rotate} disabled={busy}>
                Reset link
              </Button>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
