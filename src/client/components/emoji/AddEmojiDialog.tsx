import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import {
  CUSTOM_EMOJI_MAX_UPLOAD_BYTES,
  CUSTOM_EMOJI_MIMES,
  CUSTOM_EMOJI_NAME_MAX,
  CUSTOM_EMOJI_NAME_MIN,
  CUSTOM_EMOJI_NAME_PATTERN,
  type CustomEmojiScope,
} from "@shared/emoji";
import ResponsiveDialog from "../ui/ResponsiveDialog";
import UploadProgress from "../ui/UploadProgress";
import { useEmojiActions } from "../../hooks/emoji/useCustomEmoji";
import { useUploadProgress } from "../../hooks/useUploadProgress";
import { suggestEmojiName } from "../../utils/emojiName";

interface Props {
  open: boolean;
  onClose: () => void;
  scope: CustomEmojiScope;
}

/** Choose a picture and a name for a new emoji. */
export default function AddEmojiDialog({ open, onClose, scope }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { upload } = useEmojiActions();
  const { percent, onUploadProgress, reset } = useUploadProgress();
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (!open) {
      setFile(null);
      setName("");
      setProblem("");
      reset();
    }
  }, [open, reset]);
  useEffect(() => {
    if (!file) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    if (!(CUSTOM_EMOJI_MIMES as readonly string[]).includes(picked.type))
      return setProblem("Choose a PNG, GIF or WebP picture.");
    if (picked.size > CUSTOM_EMOJI_MAX_UPLOAD_BYTES) {
      return setProblem(
        `That picture is too big. The limit is ${Math.round(CUSTOM_EMOJI_MAX_UPLOAD_BYTES / 1024)} KB.`,
      );
    }
    setProblem("");
    setFile(picked);
    if (!name) setName(suggestEmojiName(picked.name));
  };

  const cleanName = name.trim().toLowerCase();
  const nameOk = cleanName.length >= CUSTOM_EMOJI_NAME_MIN && CUSTOM_EMOJI_NAME_PATTERN.test(cleanName);
  const submit = () => {
    if (!file || !nameOk) return;
    upload.mutate(
      { scope, name: cleanName, file, onUploadProgress },
      {
        onSuccess: () => {
          enqueueSnackbar(`Added :${cleanName}:`, { variant: "success" });
          onClose();
        },
        onError: (e: any) => {
          reset();
          setProblem(e?.response?.data?.message || e?.message || "Couldn't add the emoji");
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Add an emoji"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={!file || !nameOk || upload.isPending}>
            Add emoji
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: 2,
              border: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {preview ? <img src={preview} alt="Preview" style={{ maxWidth: 48, maxHeight: 48 }} /> : null}
          </Box>
          <Box>
            <Button variant="outlined" onClick={() => input.current?.click()}>
              {file ? "Choose another" : "Choose a picture"}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              PNG, GIF or WebP, up to {Math.round(CUSTOM_EMOJI_MAX_UPLOAD_BYTES / 1024)} KB. It is shrunk to a small
              square.
            </Typography>
          </Box>
          <input
            ref={input}
            type="file"
            hidden
            accept={CUSTOM_EMOJI_MIMES.join(",")}
            data-testid="emoji-file"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </Box>
        <TextField
          size="small"
          fullWidth
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          error={name.length > 0 && !nameOk}
          helperText={
            name.length > 0 && !nameOk ? "Use letters, numbers and underscores, at least 2." : "You type it as :name:"
          }
          slotProps={{ htmlInput: { maxLength: CUSTOM_EMOJI_NAME_MAX } }}
        />
        <UploadProgress percent={percent} label="the emoji" />
        {problem && <Alert severity="error">{problem}</Alert>}
      </Box>
    </ResponsiveDialog>
  );
}
