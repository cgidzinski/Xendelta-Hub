import { useEffect, useMemo, useState } from "react";
import { Box, Dialog, IconButton, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import CallEndIcon from "@mui/icons-material/CallEnd";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import { useAuth } from "../../contexts/AuthContext";
import { useCall } from "../../contexts/CallContext";
import { useChatCall } from "../../hooks/calls/useChatCall";
import { useSpeaking } from "../../hooks/calls/useSpeaking";
import { callClock, canShareScreen, gridColumns } from "../../utils/callMedia";
import CallTile from "./CallTile";

/** Plays everyone else's sound. Hidden: the pictures are drawn by the tiles, which stay muted so nothing plays twice. */
export function RemoteAudio() {
  const { remote } = useCall();
  return (
    <>
      {[...remote.entries()].map(([userId, streams]) =>
        streams.audio ? <AudioElement key={userId} stream={streams.audio} /> : null,
      )}
    </>
  );
}
function AudioElement({ stream }: { stream: MediaStream }) {
  return (
    <audio
      autoPlay
      ref={(el) => {
        if (el && el.srcObject !== stream) el.srcObject = stream;
      }}
    />
  );
}

/** How long the call has gone on, ticking each second. */
export function useElapsed(startedAt: string | undefined): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return startedAt ? callClock((now - new Date(startedAt).getTime()) / 1000) : "0:00";
}

/** The full-screen call: a grid of everyone (or, when someone shares a screen, that screen large with the people beside it). */
export default function CallScreen() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("sm"));
  const { user } = useAuth();
  const call = useCall();
  const { active, remote, local, muted, cameraOn, screenOn } = call;
  const chat = useChatCall(active?.conversationId);
  const elapsed = useElapsed(active?.call?.startedAt);
  const people = useMemo(() => new Map(chat.people.map((p) => [p._id, p])), [chat.people]);

  const others = (active?.call?.participants ?? []).filter((p) => p.userId !== user.id);
  const speaking = useSpeaking([
    { id: user.id, stream: muted ? null : local.stream },
    ...others.map((p) => ({ id: p.userId, stream: remote.get(p.userId)?.audio })),
  ]);

  const sharing = others.find((p) => p.screenOn && remote.get(p.userId)?.screen);
  const stage = sharing ? remote.get(sharing.userId)!.screen : screenOn ? local.screen : null;
  const stageName = sharing ? (people.get(sharing.userId)?.username ?? "Someone") : "You";

  const tiles = [
    <CallTile
      key="me"
      self
      name={user.username ?? "You"}
      avatar={user.avatar}
      stream={cameraOn ? local.stream : null}
      muted={muted}
      speaking={speaking.has(user.id) && !muted}
    />,
    ...others.map((p) => (
      <CallTile
        key={p.userId}
        name={people.get(p.userId)?.username ?? "Someone"}
        avatar={people.get(p.userId)?.avatar}
        stream={p.cameraOn ? remote.get(p.userId)?.video : null}
        muted={p.muted}
        speaking={speaking.has(p.userId)}
      />
    )),
  ];

  const control = (label: string, onClick: () => void, icon: React.ReactNode, on?: boolean, danger?: boolean) => (
    <Tooltip title={label}>
      <IconButton
        onClick={onClick}
        aria-label={label}
        aria-pressed={on}
        sx={{
          width: 52,
          height: 52,
          bgcolor: danger ? "error.main" : on ? "primary.main" : "action.selected",
          color: danger || on ? "common.white" : "text.primary",
          "&:hover": { bgcolor: danger ? "error.dark" : on ? "primary.dark" : "action.focus" },
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <Dialog fullScreen open={!!active && call.expanded} onClose={() => call.setExpanded(false)} aria-label="Call">
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, pt: "max(8px, env(safe-area-inset-top))", pb: 1 }}
        >
          <Typography sx={{ fontWeight: 600, flex: 1 }}>
            {active?.connecting ? "Connecting…" : `${1 + others.length} in call · ${elapsed}`}
          </Typography>
          {active?.connection === "lost" && (
            <Typography variant="caption" color="warning.main" role="status">
              Connection lost, trying to reconnect…
            </Typography>
          )}
          <Tooltip title="Back to the chat">
            <IconButton onClick={() => call.setExpanded(false)} aria-label="Minimise call">
              <CloseFullscreenIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1.5 }}>
          {stage ? (
            <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 1.5, height: "100%" }}>
              <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <CallTile name={stageName} stream={stage} screen />
                </Box>
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "repeat(3, 1fr)", md: "1fr" },
                  gap: 1,
                  width: { md: 220 },
                  alignContent: "start",
                }}
              >
                {tiles}
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: `repeat(${gridColumns(tiles.length, narrow)}, minmax(0, 1fr))`,
                gap: 1.5,
                maxWidth: tiles.length === 1 ? 640 : undefined,
                mx: "auto",
              }}
            >
              {tiles}
            </Box>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 1.5,
            pt: 1.5,
            pb: "max(16px, env(safe-area-inset-bottom))",
          }}
        >
          {control(muted ? "Unmute" : "Mute", call.toggleMute, muted ? <MicOffIcon /> : <MicIcon />, muted)}
          {control(
            cameraOn ? "Turn camera off" : "Turn camera on",
            () => void call.toggleCamera(),
            cameraOn ? <VideocamIcon /> : <VideocamOffIcon />,
            cameraOn,
          )}
          {canShareScreen() &&
            control(
              screenOn ? "Stop sharing" : "Share screen",
              () => void call.toggleScreen(),
              screenOn ? <StopScreenShareIcon /> : <ScreenShareIcon />,
              screenOn,
            )}
          {control("Leave call", () => void call.leave(), <CallEndIcon />, false, true)}
        </Box>
      </Box>
    </Dialog>
  );
}
