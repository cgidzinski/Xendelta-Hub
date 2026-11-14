import { useEffect } from "react";
import { Box, Button, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import VideocamIcon from "@mui/icons-material/Videocam";
import CallEndIcon from "@mui/icons-material/CallEnd";
import { useCall } from "../../contexts/CallContext";

/** A soft two-note ring, made with the browser's audio (no sound file to ship), repeating until stopped. */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    const ring = () => {
      for (const [at, hz] of [
        [0, 880],
        [0.25, 660],
      ] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + 0.25);
      }
    };
    void ctx.resume().catch(() => undefined);
    ring();
    const timer = setInterval(ring, 2000);
    return () => {
      clearInterval(timer);
      void ctx.close().catch(() => undefined);
    };
  }, [on]);
}

/** A call coming in: who is calling, with answer and decline, and a ring. */
export default function IncomingCallBanner() {
  const { incoming, join, decline } = useCall();
  useRingtone(!!incoming);
  if (!incoming) return null;
  return (
    <Box
      role="alertdialog"
      aria-label={`Incoming call from ${incoming.fromName}`}
      sx={{
        position: "fixed",
        zIndex: (t) => t.zIndex.modal + 1,
        top: "max(12px, env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(420px, calc(100vw - 24px))",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: 3,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        boxShadow: 6,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }} noWrap>
          {incoming.fromName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Incoming {incoming.video ? "video" : "voice"} call
        </Typography>
      </Box>
      <Button
        variant="contained"
        color="error"
        onClick={() => void decline()}
        startIcon={<CallEndIcon />}
        aria-label="Decline call"
      >
        Decline
      </Button>
      <Button
        variant="contained"
        color="success"
        onClick={() => void join(incoming.conversationId, incoming.video)}
        startIcon={incoming.video ? <VideocamIcon /> : <CallIcon />}
        aria-label="Answer call"
      >
        Answer
      </Button>
    </Box>
  );
}
