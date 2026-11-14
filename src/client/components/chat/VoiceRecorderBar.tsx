import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SendIcon from "@mui/icons-material/Send";
import { useSnackbar } from "notistack";
import { VOICE_MAX_SECONDS, type ChatAttachment, type ChatVoice } from "@shared/chat";
import { useVoiceRecorder } from "../../hooks/chat/useVoiceRecorder";
import { uploadOne } from "../../hooks/xendrive/useXendrive";
import { formatDuration } from "../../utils/voice";

interface Props {
  conversationId: string;
  /** The recording is uploaded (as a chat file); this sends the message. */
  onSend: (attachment: ChatAttachment, voice: ChatVoice) => void;
  onClose: () => void;
}

/** Replaces the message box while a voice message is being recorded: cancel, how long so far, and send. Starts on its own. */
export default function VoiceRecorderBar({ conversationId, onSend, onClose }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const recorder = useVoiceRecorder();
  const [uploading, setUploading] = useState(false);
  // React runs effects twice in development: only the first start counts.
  const startedOnce = useRef(false);

  useEffect(() => {
    if (startedOnce.current) return;
    startedOnce.current = true;
    recorder.start().catch((e: unknown) => {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      enqueueSnackbar(denied ? "Allow the microphone to record a voice message." : "Couldn't start the microphone.", {
        variant: "error",
      });
      onClose();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    const recording = await recorder.finish();
    if (!recording) return onClose();
    setUploading(true);
    try {
      const stored = await uploadOne({ file: recording.file, source: { app: "chat", ref: conversationId } });
      onSend({ fileId: stored._id, name: stored.name, mimeType: stored.mimeType, size: stored.size }, recording.voice);
      onClose();
    } catch (e: any) {
      enqueueSnackbar(
        e?.response?.status === 403
          ? "Not enough storage for the recording."
          : e?.response?.data?.message || "Couldn't send the voice message.",
        { variant: "error" },
      );
      setUploading(false);
    }
  };

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 1, px: 0.5, py: 0.25 }}
      role="group"
      aria-label="Recording a voice message"
    >
      <IconButton
        aria-label="Cancel recording"
        onClick={() => {
          recorder.cancel();
          onClose();
        }}
        disabled={uploading}
      >
        <DeleteOutlineIcon />
      </IconButton>
      <Box
        aria-hidden
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: "error.main",
          flexShrink: 0,
          animation: uploading ? "none" : "voicePulse 1.2s ease-in-out infinite",
          "@keyframes voicePulse": { "50%": { opacity: 0.25 } },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      />
      <Typography sx={{ fontVariantNumeric: "tabular-nums" }} aria-live="off">
        {formatDuration(recorder.seconds)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }} noWrap>
        {uploading ? "Sending…" : `Recording, up to ${formatDuration(VOICE_MAX_SECONDS)}`}
      </Typography>
      <IconButton
        color="primary"
        onClick={send}
        disabled={uploading || !recorder.recording}
        aria-label="Send voice message"
        sx={{
          bgcolor: "primary.main",
          color: "primary.contrastText",
          borderRadius: 1.5,
          "&:hover": { bgcolor: "primary.dark" },
        }}
      >
        {uploading ? <CircularProgress size={20} color="inherit" /> : <SendIcon fontSize="small" />}
      </IconButton>
    </Box>
  );
}
