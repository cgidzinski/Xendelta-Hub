import { useState } from "react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { api } from "../../../../config/api";

interface ChangeEmailDialogProps {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
  /** The link was sent: the profile is refetched so it shows the address that is waiting. */
  onSent: () => void;
}

/**
 * Change the account's email: the new address and the current password. A link goes to the new address and the email
 * only changes when it is opened, so the dialog ends by saying where to look.
 */
export default function ChangeEmailDialog({ open, currentEmail, onClose, onSent }: ChangeEmailDialogProps) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    onClose();
    // Cleared after the close animation, so the dialog doesn't flash its empty form while leaving.
    setTimeout(() => {
      setNewEmail("");
      setPassword("");
      setError("");
      setSentTo(null);
    }, 200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/user/email-change", { newEmail, password });
      setSentTo(newEmail.trim().toLowerCase());
      setPassword("");
      onSent();
    } catch (err) {
      setError((err as Error).message || "Couldn't send the link. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      maxWidth="xs"
      title="Change email"
      actions={
        sentTo ? (
          <Button variant="contained" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="contained"
              type="submit"
              form="change-email-form"
              disabled={busy || !newEmail || !password}
            >
              {busy ? "Sending..." : "Send link"}
            </Button>
          </>
        )
      }
    >
      {sentTo ? (
        <Stack spacing={1.5}>
          <Alert severity="success">We sent a link to {sentTo}.</Alert>
          <Typography variant="body2" color="text.secondary">
            Open it within an hour to finish. Until then you keep signing in with {currentEmail}, and we'll tell that
            address once the change is made.
          </Typography>
        </Stack>
      ) : (
        <form id="change-email-form" onSubmit={submit}>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              We'll send a link to the new address. Your email only changes when you open it.
            </Typography>
            <TextField
              label="New email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoFocus
              fullWidth
            />
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </form>
      )}
    </ResponsiveDialog>
  );
}
