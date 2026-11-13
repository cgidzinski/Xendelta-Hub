import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, IconButton, TextField, Typography } from "@mui/material";
import AddAPhotoOutlinedIcon from "@mui/icons-material/AddAPhotoOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import UploadProgress from "../../../../components/ui/UploadProgress";
import { useUploadProgress } from "../../../../hooks/useUploadProgress";
import type { AxiosProgressEvent } from "axios";

/** Photos on one "done" (the server's MAX_XENROUTINE_IMAGES). */
export const MAX_DONE_PHOTOS = 5;
const NOTE_MAX = 500;

interface CompleteDialogProps {
  open: boolean;
  routineName: string;
  onClose: () => void;
  /**
   * Mark it done with what was entered. Resolves when it is recorded (the dialog then closes); rejects when it
   * couldn't be, with the reason already shown, so the dialog stays open and nothing typed is lost.
   */
  onSubmit: (v: { note: string; files: File[]; onUploadProgress: (e: AxiosProgressEvent) => void }) => Promise<void>;
}

/** Mark a routine done with a note and/or photos: the filter you replaced, a meter reading, what you found. */
export default function CompleteDialog({ open, routineName, onClose, onSubmit }: CompleteDialogProps) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { percent, onUploadProgress, reset } = useUploadProgress();

  useEffect(() => {
    if (open) {
      setNote("");
      setFiles([]);
      setProblem(null);
      reset();
    }
  }, [open, reset]);

  // Previews of the chosen photos, released when they change or the dialog goes.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = [...list].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (picked.length < list.length) setProblem("Only photos can be added.");
    else if (files.length + picked.length > MAX_DONE_PHOTOS) setProblem(`Up to ${MAX_DONE_PHOTOS} photos.`);
    else setProblem(null);
    setFiles((cur) => [...cur, ...picked].slice(0, MAX_DONE_PHOTOS));
    if (input.current) input.current.value = ""; // so choosing the same photo again still counts
  };

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit({ note: note.trim(), files, onUploadProgress });
    } catch (e) {
      // The reason is already on screen (a toast); keep what was typed so a retry is one press.
      reset();
      setBusy(false);
      if ((e as Error)?.message !== "cancelled") setProblem("Couldn't mark it as done. Try again.");
      return;
    }
    setBusy(false);
    reset();
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="xs"
      title={`Done: ${routineName}`}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Mark as done"}
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <TextField
          label="Note (optional)"
          placeholder="Replaced the cartridge, next spare is in the garage"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          minRows={2}
          fullWidth
          autoFocus
          disabled={busy}
          slotProps={{ htmlInput: { maxLength: NOTE_MAX } }}
        />

        <Box>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="Choose photos"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button
            size="small"
            startIcon={<AddAPhotoOutlinedIcon />}
            onClick={() => input.current?.click()}
            disabled={busy || files.length >= MAX_DONE_PHOTOS}
          >
            Add photos
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {files.length}/{MAX_DONE_PHOTOS}
          </Typography>
          {files.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
              {previews.map((url, i) => (
                <Box key={url} sx={{ position: "relative", width: 72, height: 72 }}>
                  <Box
                    component="img"
                    src={url}
                    alt={`Photo ${i + 1}`}
                    sx={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: 1,
                      border: 1,
                      borderColor: "divider",
                    }}
                  />
                  <IconButton
                    size="small"
                    aria-label={`Remove photo ${i + 1}`}
                    disabled={busy}
                    onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
                    sx={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      bgcolor: "background.paper",
                      border: 1,
                      borderColor: "divider",
                      p: 0.25,
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <UploadProgress percent={percent} label="photos" />
        {problem && <Alert severity="error">{problem}</Alert>}
      </Box>
    </ResponsiveDialog>
  );
}
