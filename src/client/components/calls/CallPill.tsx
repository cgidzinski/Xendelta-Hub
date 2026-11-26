import { Box, IconButton, Typography } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { RADIUS } from "../../theme";
import { useCall } from "../../contexts/CallContext";
import { useElapsed } from "./CallScreen";

/** A small bar over the app while you are in a call but looking at something else: the time, mute, leave and back to the call. */
export default function CallPill() {
  const call = useCall();
  const elapsed = useElapsed(call.active?.call?.startedAt);
  if (!call.active || call.expanded) return null;
  return (
    <Box
      role="region"
      aria-label="Call in progress"
      sx={{
        position: "fixed",
        zIndex: (t) => t.zIndex.snackbar - 1,
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        pl: 2,
        pr: 0.5,
        py: 0.5,
        borderRadius: RADIUS.pill,
        border: 1,
        borderColor: call.active.connection === "lost" ? "warning.main" : "divider",
        bgcolor: "background.paper",
        color: "text.primary",
        width: "max-content",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mr: 1, fontVariantNumeric: "tabular-nums" }}>
        {call.active.connection === "lost"
          ? "Reconnecting…"
          : call.active.connecting
            ? "Connecting…"
            : `In call · ${elapsed}`}
      </Typography>
      <IconButton
        color="inherit"
        disabled={!call.local.stream}
        onClick={call.toggleMute}
        aria-label={call.muted ? "Unmute" : "Mute"}
      >
        {call.muted ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
      </IconButton>
      <IconButton color="inherit" onClick={() => call.setExpanded(true)} aria-label="Open call">
        <OpenInFullIcon fontSize="small" />
      </IconButton>
      <IconButton color="inherit" onClick={() => void call.leave()} aria-label="Leave call">
        <CallEndIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
