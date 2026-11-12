import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { addDays, addHours, addMonths, addWeeks, format } from "date-fns";
import { useSnackbar } from "notistack";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { fileShareUrl, useXendriveActions } from "../../../../hooks/xendrive/useXendrive";
import type { XenDriveFile } from "../../../../types/XenDriveFile";

const PRESETS: Array<{ label: string; at: (now: Date) => Date }> = [
  { label: "1 hour", at: (n) => addHours(n, 1) },
  { label: "1 day", at: (n) => addDays(n, 1) },
  { label: "1 week", at: (n) => addWeeks(n, 1) },
  { label: "1 month", at: (n) => addMonths(n, 1) },
];

/** The `datetime-local` input's value for a date, in the person's own time zone. */
const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/**
 * Everything about a file's public link: the on/off switch, the address, a password, and when it stops
 * working. Each change saves at once. Used on the file page and in the Share dialog.
 */
export default function FileSharePanel({ file }: { file: XenDriveFile }) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { updateFileSettings, rotateFileLink } = useXendriveActions();
  const [password, setPassword] = useState(file.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [picking, setPicking] = useState(false);
  const busy = updateFileSettings.isPending || rotateFileLink.isPending;

  // Follow the file when it changes underneath (another tab, a new link)
  useEffect(() => setPassword(file.password ?? ""), [file._id, file.password]);

  const save = (settings: Parameters<typeof updateFileSettings.mutate>[0]["settings"], message?: string) =>
    updateFileSettings.mutate(
      { fileId: file._id, settings },
      {
        onSuccess: () => message && enqueueSnackbar(message, { variant: "success" }),
        onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't save", { variant: "error" }),
      },
    );

  const url = file.shareToken ? fileShareUrl(file.shareToken) : "";
  const expiry = file.expiry ? new Date(file.expiry) : null;
  const expired = !!expiry && expiry <= new Date();

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

      <Box>
        <SectionLabel>Password</SectionLabel>
        <TextField
          fullWidth
          size="small"
          type={showPassword ? "text" : "password"}
          value={password}
          placeholder={file.hasPassword ? "Enter a new password" : "Set a password"}
          onChange={(e) => setPassword(e.target.value)}
          slotProps={{
            htmlInput: { "aria-label": "Password", maxLength: 200 },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon fontSize="small" color={file.hasPassword ? "success" : "inherit"} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="outlined"
            disabled={busy || password === (file.password ?? "") || password === ""}
            onClick={() => save({ password }, "Password saved")}
          >
            Save password
          </Button>
          {file.hasPassword && (
            <Button
              size="small"
              color="error"
              disabled={busy}
              onClick={() => {
                setPassword("");
                save({ password: null }, "Password removed");
              }}
            >
              Remove password
            </Button>
          )}
          <Typography variant="body2" color="text.secondary">
            People need it to download.
          </Typography>
        </Box>
      </Box>

      <Box>
        <SectionLabel>Link expires</SectionLabel>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", mb: 1.5 }}>
          <Chip
            label="Never"
            clickable
            color={!expiry ? "primary" : "default"}
            variant={!expiry ? "filled" : "outlined"}
            onClick={() => {
              setPicking(false);
              save({ expiry: null }, "Link no longer expires");
            }}
          />
          {PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              clickable
              variant="outlined"
              onClick={() => {
                setPicking(false);
                save({ expiry: p.at(new Date()).toISOString() }, `Link expires in ${p.label}`);
              }}
            />
          ))}
          <Chip
            label="Pick a date…"
            clickable
            variant={picking ? "filled" : "outlined"}
            color={picking ? "primary" : "default"}
            onClick={() => setPicking((v) => !v)}
          />
        </Stack>

        {picking && (
          <TextField
            type="datetime-local"
            size="small"
            fullWidth
            defaultValue={toLocalInput(expiry ?? addDays(new Date(), 1))}
            slotProps={{ htmlInput: { "aria-label": "Expiry date and time", min: toLocalInput(new Date()) } }}
            onChange={(e) => {
              const when = new Date(e.target.value);
              if (!Number.isNaN(when.getTime())) save({ expiry: when.toISOString() });
            }}
            sx={{ mb: 1.5 }}
          />
        )}

        {expiry && (
          <Alert severity={expired ? "error" : "warning"} icon={<ScheduleIcon fontSize="small" />} sx={{ py: 0.5 }}>
            {expired ? "This link has expired" : `Stops working on ${format(expiry, "MMM d, h:mm a")}`}
          </Alert>
        )}
      </Box>
    </Stack>
  );
}
