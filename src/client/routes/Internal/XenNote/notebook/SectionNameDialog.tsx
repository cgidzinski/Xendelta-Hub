import { useEffect, useState } from "react";
import { Button, TextField } from "@mui/material";
import { MAX_SECTION_NAME } from "@shared/xennote/pages";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";

interface SectionNameDialogProps {
  open: boolean;
  title: string;
  /** The name to start from (renaming), empty when adding. */
  initial?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

/** Asks for a section's name: when adding one and when renaming one. */
export default function SectionNameDialog({
  open,
  title,
  initial = "",
  confirmLabel = "Save",
  onClose,
  onSubmit,
}: SectionNameDialogProps) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const clean = name.trim();
  const submit = () => {
    if (clean) onSubmit(clean);
  };
  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={!clean} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        margin="dense"
        label="Section name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        slotProps={{ htmlInput: { maxLength: MAX_SECTION_NAME } }}
      />
    </ResponsiveDialog>
  );
}
