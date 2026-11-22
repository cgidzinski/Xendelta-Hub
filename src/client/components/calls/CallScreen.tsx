import { useEffect, useId, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, IconButton, Tooltip, Typography, useMediaQuery } from "@mui/material";
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
import { useUserProfile } from "../../hooks/user/useUserProfile";
import { useChatCall } from "../../hooks/calls/useChatCall";

import { callClock, canShareScreen, gridColumns } from "../../utils/callMedia";
import { RADIUS } from "../../theme";
import CallTile from "./CallTile";
import DeviceMenu from "./DeviceMenu";

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
  const titleId = useId();
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("sm"));
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const call = useCall();
  const { active, remote, local, muted, cameraOn, screenOn, speaking } = call;
  const chat = useChatCall(active?.conversationId);
  const elapsed = useElapsed(active?.call?.startedAt);
  const people = useMemo(() => new Map(chat.people.map((p) => [p._id, p])), [chat.people]);

  const others = (active?.call?.participants ?? []).filter((p) => p.userId !== user.id);
  const title =
    active?.call?.kind === "voice" ? "Voice channel" : active?.call?.kind === "group" ? "Group call" : "Call";
  const ready = !!active && !active.connecting && active.connection === "ok";

  const sharing = others.find((p) => p.screenOn && remote.get(p.userId)?.screen);
  const stage = sharing ? remote.get(sharing.userId)!.screen : screenOn ? local.screen : null;
  const stageName = sharing ? `${people.get(sharing.userId)?.username ?? "Someone"}’s screen` : "Your screen";

  const tiles = [
    <CallTile
      key="me"
      self
      name={user.username ?? "You"}
      avatar={user.avatar}
      cosmetics={profile?.cosmetics}
      stream={cameraOn ? local.stream : null}
      muted={muted}
      speaking={speaking.has(user.id) && !muted}
    />,
    ...others.map((p) => (
      <CallTile
        key={p.userId}
        name={people.get(p.userId)?.username ?? "Someone"}
        avatar={people.get(p.userId)?.avatar}
        cosmetics={people.get(p.userId)?.cosmetics}
        stream={p.cameraOn ? remote.get(p.userId)?.video : null}
        muted={p.muted}
        speaking={!p.muted && speaking.has(p.userId)}
      />
    )),
  ];

  const control = (
    label: string,
    action: string,
    onClick: () => void,
    icon: React.ReactNode,
    pressed: boolean,
    disabled = !ready,
  ) => (
    <Tooltip title={action}>
      <span>
        <Button
          aria-label={action}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          sx={{
            minWidth: { xs: 50, sm: 66 },
            minHeight: 52,
            px: 0.75,
            py: 0.5,
            borderRadius: RADIUS.md,
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
            color: pressed ? "primary.contrastText" : "text.primary",
            bgcolor: pressed ? "primary.main" : "action.hover",
            "&:hover": { bgcolor: pressed ? "primary.dark" : "action.selected" },
          }}
        >
          {icon}
          <Typography variant="caption">{label}</Typography>
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Dialog
      fullScreen
      open={!!active && call.expanded}
      onClose={() => call.setExpanded(false)}
      aria-labelledby={titleId}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: { xs: 1.5, sm: 2 },
            pt: "max(8px, env(safe-area-inset-top))",
            pb: 1,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id={titleId} component="h2" variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {active?.connecting ? "Connecting…" : `${tiles.length} in call · ${elapsed}`}
            </Typography>
          </Box>
          {ready && <DeviceMenu />}
          <Tooltip title="Back to the chat">
            <IconButton onClick={() => call.setExpanded(false)} aria-label="Minimise call">
              <CloseFullscreenIcon />
            </IconButton>
          </Tooltip>
        </Box>
        {active?.connection === "lost" && (
          <Alert severity="warning" role="status" sx={{ mx: 1.5, mt: 1.5 }}>
            Connection lost. Trying to reconnect…
          </Alert>
        )}

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1.5 }}>
          {stage ? (
            <Box
              sx={{
                height: "100%",
                minHeight: { xs: 192, md: 0 },
                display: "grid",
                gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) minmax(144px, 19%)" },
                gridTemplateRows: { xs: "minmax(0, 1fr) 90px", md: "minmax(0, 1fr)" },
                gap: 1.5,
              }}
            >
              <CallTile name={stageName} stream={stage} screen />
              <Box
                role="group"
                aria-label="Call participants"
                sx={{
                  display: "grid",
                  gridAutoFlow: { xs: "column", md: "row" },
                  gridAutoColumns: { xs: "minmax(88px, 1fr)", md: "auto" },
                  gridTemplateColumns: { md: "minmax(0, 1fr)" },
                  gridAutoRows: { md: "max-content" },
                  overflow: "auto",
                  gap: 1,
                  pb: { xs: 0.5, md: 0 },
                }}
              >
                {tiles}
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                minHeight: "100%",
                display: "grid",
                alignContent: "safe center",
                gridTemplateColumns: `repeat(${gridColumns(tiles.length, narrow)}, minmax(0, 1fr))`,
                gap: 1.5,
                maxWidth: tiles.length === 1 ? 640 : tiles.length <= 4 ? 960 : 1440,
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
            gap: { xs: 0.75, sm: 1.25 },
            pt: 1,
            pb: "max(12px, env(safe-area-inset-bottom))",
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {control(
            muted ? "Unmute" : "Mute",
            muted ? "Unmute" : "Mute",
            call.toggleMute,
            muted ? <MicOffIcon /> : <MicIcon />,
            muted,
            !local.stream,
          )}
          {control(
            "Camera",
            cameraOn ? "Turn camera off" : "Turn camera on",
            () => void call.toggleCamera(),
            cameraOn ? <VideocamIcon /> : <VideocamOffIcon />,
            cameraOn,
          )}
          {canShareScreen() &&
            control(
              screenOn ? "Stop share" : "Share",
              screenOn ? "Stop sharing" : "Share screen",
              () => void call.toggleScreen(),
              screenOn ? <StopScreenShareIcon /> : <ScreenShareIcon />,
              screenOn,
            )}
          <Button
            variant="contained"
            color="error"
            aria-label="Leave call"
            onClick={() => void call.leave()}
            sx={{ minWidth: 54, minHeight: 52, display: "flex", flexDirection: "column", px: 1, py: 0.5, ml: 0.5 }}
          >
            <CallEndIcon />
            <Typography variant="caption">Leave</Typography>
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
