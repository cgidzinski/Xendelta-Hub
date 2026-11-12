import { useEffect, useState } from "react";
import { Button, TextField } from "@mui/material";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  /** Set to rename an existing item; omit to create a folder. */
  initialName?: string;
  /** What is being named. A file's name can be longer than a folder's. */
  kind?: "folder" | "file";
  /** Save and resolve; throw to keep the dialog open with the message. */
  onSave: (name: string) => Promise<void>;
}

const LIMITS = { folder: 100, file: 255 };

/** Create a folder, or rename a folder or a file. Shows how much of the name's length is used. */
export default function FolderDialog({ open, onClose, initialName = "", kind = "folder", onSave }: FolderDialogProps) {
  const renaming = initialName !== "";
  const limit = LIMITS[kind];
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
      setError((e as Error).message || `Couldn't save the ${kind}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={renaming ? `Rename ${kind}` : "New folder"}
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
        label={kind === "file" ? "File name" : "Folder name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        error={!!error}
        helperText={error ?? `${name.length} / ${limit}`}
        slotProps={{ htmlInput: { maxLength: limit } }}
      />
    </ResponsiveDialog>
  );
}
