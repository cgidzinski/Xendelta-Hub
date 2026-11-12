import { useRef, useState } from "react";
import { Alert, Box, Button, LinearProgress, List, ListItem, ListItemText, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useXendriveUpload } from "../../../../hooks/xendrive/useXendrive";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { formatFileSize } from "../../../../utils/fileUtils";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** The folder the files go into; null is the top level. */
  folderId: string | null;
}

interface Item {
  id: number;
  file: File;
  status: "waiting" | "uploading" | "done" | "failed";
  percent: number;
  error?: string;
}

/** Pick several files and upload them one after another into the open folder, each with its own progress. */
export default function UploadDialog({ open, onClose, folderId }: UploadDialogProps) {
  const { profile } = useUserProfile();
  const { uploadFile } = useXendriveUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);

  const patch = (id: number, change: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const total = items.filter((i) => i.status === "waiting").reduce((sum, i) => sum + i.file.size, 0);
  const available = Math.max(0, (profile?.xendrive?.spaceAllowed ?? 0) - (profile?.xendrive?.spaceUsed ?? 0));
  const overQuota = !!profile?.xendrive && total > available;
  const waiting = items.filter((i) => i.status === "waiting");

  const pick = (files: FileList | null) => {
    if (!files) return;
    const added: Item[] = Array.from(files).map((file) => ({
      id: nextId.current++,
      file,
      status: "waiting",
      percent: 0,
    }));
    setItems((list) => [...list, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const start = async () => {
    setRunning(true);
    for (const item of items.filter((i) => i.status === "waiting")) {
      patch(item.id, { status: "uploading", percent: 0 });
      try {
        await uploadFile({ file: item.file, folderId, onProgress: (percent) => patch(item.id, { percent }) });
        patch(item.id, { status: "done", percent: 100 });
      } catch (e) {
        patch(item.id, { status: "failed", error: (e as Error).message || "Upload failed" });
      }
    }
    setRunning(false);
  };

  const close = () => {
    if (running) return;
    setItems([]);
    onClose();
  };

  const finished = items.length > 0 && waiting.length === 0 && !running;

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      maxWidth="sm"
      title="Upload files"
      actions={
        <>
          <Button onClick={close} disabled={running}>
            {finished ? "Done" : "Cancel"}
          </Button>
          {!finished && (
            <Button variant="contained" onClick={start} disabled={waiting.length === 0 || running || overQuota}>
              {running ? "Uploading..." : `Upload ${waiting.length || ""}`.trim()}
            </Button>
          )}
        </>
      }
    >
      <input
        ref={inputRef}
        id="xendrive-upload-input"
        type="file"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      <Button variant="outlined" fullWidth disabled={running} onClick={() => inputRef.current?.click()} sx={{ mb: 2 }}>
        {items.length === 0 ? "Choose files" : "Add more files"}
      </Button>

      {overQuota && (
        <Alert severity="error" sx={{ mb: 2 }}>
          These files ({formatFileSize(total)}) are more than the space you have left ({formatFileSize(available)}).
          Remove some or delete other files first.
        </Alert>
      )}

      {items.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          You can pick several files at once. They upload one after another.
        </Typography>
      ) : (
        <List dense disablePadding>
          {items.map((item) => (
            <ListItem key={item.id} disableGutters sx={{ display: "block" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ListItemText
                  primary={item.file.name}
                  secondary={item.status === "failed" ? item.error : formatFileSize(item.file.size)}
                  slotProps={{
                    primary: { noWrap: true },
                    secondary: { color: item.status === "failed" ? "error" : "text.secondary" },
                  }}
                />
                {item.status === "done" && <CheckCircleIcon color="success" fontSize="small" />}
                {item.status === "failed" && <ErrorOutlineIcon color="error" fontSize="small" />}
                {item.status === "waiting" && !running && (
                  <Button size="small" onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}>
                    Remove
                  </Button>
                )}
              </Box>
              {item.status === "uploading" && (
                <LinearProgress variant="determinate" value={item.percent} sx={{ height: 6, borderRadius: 1 }} />
              )}
            </ListItem>
          ))}
        </List>
      )}
    </ResponsiveDialog>
  );
}
