import { useEffect, useState } from "react";
import { Button, TextField } from "@mui/material";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  /** Set to rename an existing folder; omit to create one. */
  initialName?: string;
  /** Save and resolve; throw to keep the dialog open with the message. */
  onSave: (name: string) => Promise<void>;
}

/** Create or rename a folder. */
export default function FolderDialog({ open, onClose, initialName = "", onSave }: FolderDialogProps) {
  const renaming = initialName !== "";
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [open, initialName]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch (e) {
      setError((e as Error).message || "Couldn't save the folder");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={renaming ? "Rename folder" : "New folder"}
      actions={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={!name.trim() || saving}>
            {renaming ? "Rename" : "Create"}
          </Button>
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        margin="dense"
        label="Folder name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        error={!!error}
        helperText={error ?? " "}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
    </ResponsiveDialog>
  );
}
