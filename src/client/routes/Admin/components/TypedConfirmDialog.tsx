import { useEffect, useState } from "react";
import { Button, TextField, Typography } from "@mui/material";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";

interface TypedConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  message: string;
  /** The text that must be typed (a username, or DELETE). The server checks it too. */
  phrase: string;
  confirmLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** A destructive action that needs a word typed first, so it can't be done by a stray click. */
export default function TypedConfirmDialog({
  open,
  title,
  message,
  phrase,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: TypedConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" color="error" disabled={typed !== phrase || busy} onClick={onConfirm}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {message}
      </Typography>
      <TextField
        autoFocus
        fullWidth
        size="small"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        label={`Type ${phrase} to confirm`}
        slotProps={{ htmlInput: { "aria-label": `Type ${phrase} to confirm`, autoComplete: "off" } }}
      />
    </ResponsiveDialog>
  );
}
