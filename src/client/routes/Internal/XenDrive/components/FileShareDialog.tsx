import { Button } from "@mui/material";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import type { XenDriveFile } from "../../../../types/XenDriveFile";
import FileSharePanel from "./FileSharePanel";

interface FileShareDialogProps {
  /** The file being shared, kept current by the page behind. */
  file: XenDriveFile | null;
  onClose: () => void;
}

/** A file's link, password and expiry in a dialog (the same controls as on the file's own page). */
export default function FileShareDialog({ file, onClose }: FileShareDialogProps) {
  return (
    <ResponsiveDialog
      open={!!file}
      onClose={onClose}
      maxWidth="xs"
      title={`Share “${file?.name ?? ""}”`}
      actions={<Button onClick={onClose}>Done</Button>}
    >
      {file && <FileSharePanel file={file} />}
    </ResponsiveDialog>
  );
}
