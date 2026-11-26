import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import MicIcon from "@mui/icons-material/Mic";
import SendIcon from "@mui/icons-material/Send";
import { useSnackbar } from "notistack";
import { VOICE_MAX_SECONDS, type ChatAttachment, type ChatVoice } from "@shared/chat";
import { useVoiceRecorder, type Recording } from "../../hooks/chat/useVoiceRecorder";
import { uploadOne } from "../../hooks/xendrive/useXendrive";
import { formatDuration } from "../../utils/voice";
import { mediaErrorText } from "../../utils/mediaErrors";

interface Props {
  conversationId: string;
  enabled: boolean;
  onSend?: (attachment: ChatAttachment, voice: ChatVoice) => void;
  children: ReactNode;
}

const TAP_MS = 250;

/** Wraps the composer so the microphone keeps pointer capture when the editor gives way to the recording controls. */
export default function VoiceRecorderBar({ conversationId, enabled, onSend, children }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const recorder = useVoiceRecorder();
  const [mode, setMode] = useState<"touch" | "tap" | null>(null);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState<Recording | null>(null);
  const pointer = useRef<{ id: number; started: number } | null>(null);
  const attempt = useRef<symbol | null>(null);
  const lastTouch = useRef(-Infinity);

  useEffect(
    () => () => {
      attempt.current = null;
    },
    [],
  );

  const close = () => {
    attempt.current = null;
    pointer.current = null;
    recorder.cancel();
    setMode(null);
    setReady(false);
    setRetry(null);
    setSending(false);
  };

  const start = async (nextMode: "touch" | "tap") => {
    const ticket = Symbol();
    attempt.current = ticket;
    setMode(nextMode);
    try {
      const started = await recorder.start();
      if (started && attempt.current === ticket) setReady(true);
    } catch (error) {
      if (attempt.current !== ticket) return;
      enqueueSnackbar(mediaErrorText(error, "microphone") ?? "Couldn't start the microphone.", { variant: "error" });
      close();
    }
  };

  const send = async () => {
    const ticket = attempt.current;
    if (!ticket || !ready || sending || !onSend) return;
    setMode("tap");
    setSending(true);
    const recording = retry ?? (await recorder.finish());
    if (attempt.current !== ticket) return;
    if (!recording) {
      enqueueSnackbar("Couldn't save the voice recording.", { variant: "error" });
      close();
      return;
    }
    try {
      const stored = await uploadOne({ file: recording.file, source: { app: "chat", ref: conversationId } });
      if (attempt.current !== ticket) return;
      onSend({ fileId: stored._id, name: stored.name, mimeType: stored.mimeType, size: stored.size }, recording.voice);
      close();
    } catch (e: any) {
      if (attempt.current !== ticket) return;
      enqueueSnackbar(e?.response?.data?.message || "Couldn't send the voice message.", { variant: "error" });
      setRetry(recording);
      setSending(false);
    }
  };

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch" || !event.isPrimary || attempt.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, started: performance.now() };
    void start("touch");
  };

  const release = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    const duration = performance.now() - pointer.current.started;
    pointer.current = null;
    lastTouch.current = performance.now();
    if (duration < TAP_MS) setMode("tap");
    else if (ready) void send();
    else close();
  };

  const cancelPress = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current?.id === event.pointerId) {
      lastTouch.current = performance.now();
      close();
    }
  };

  return (
    <Box sx={{ display: "flex", alignItems: mode ? "center" : "flex-end", gap: 0.5 }}>
      {mode ? (
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 0.75, flex: 1, minWidth: 0 }}
          role="group"
          aria-label="Voice message"
        >
          <IconButton aria-label="Discard voice recording" disabled={sending} onClick={close}>
            <DeleteOutlineIcon />
          </IconButton>
          <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>{formatDuration(recorder.seconds)}</Typography>
          <Typography variant="body2" color="text.secondary" role="status" sx={{ flex: 1 }}>
            {sending
              ? "Sending…"
              : retry
                ? "Ready to retry"
                : !ready
                  ? "Starting microphone…"
                  : mode === "touch"
                    ? "Release to send"
                    : recorder.recording
                      ? `Recording · up to ${formatDuration(VOICE_MAX_SECONDS)}`
                      : "Ready to send"}
          </Typography>
          {mode === "tap" && (
            <IconButton
              aria-label={retry ? "Retry voice message" : "Send voice message"}
              color="primary"
              disabled={!ready || sending}
              onClick={() => void send()}
            >
              {sending ? <CircularProgress size={20} color="inherit" /> : <SendIcon fontSize="small" />}
            </IconButton>
          )}
        </Box>
      ) : (
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      )}
      {(mode === "touch" || (!mode && enabled)) && (
        <Tooltip title="Record a voice message" disableTouchListener>
          <IconButton
            aria-label="Record a voice message"
            onPointerDown={press}
            onPointerUp={release}
            onPointerCancel={cancelPress}
            onLostPointerCapture={cancelPress}
            onContextMenu={(event) => {
              if (mode === "touch") event.preventDefault();
            }}
            onClick={(event) => {
              if (!attempt.current && (event.detail === 0 || performance.now() - lastTouch.current > 500)) {
                void start("tap");
              }
            }}
            sx={{ touchAction: "none", minWidth: 44, minHeight: 44, color: mode ? "error.main" : undefined }}
          >
            {mode ? <MicIcon /> : <MicNoneOutlinedIcon />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
