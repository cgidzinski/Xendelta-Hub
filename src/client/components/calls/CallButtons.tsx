import { IconButton, Tooltip } from "@mui/material";
import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import HeadsetMicOutlinedIcon from "@mui/icons-material/HeadsetMicOutlined";
import { useCall } from "../../contexts/CallContext";

/** The header buttons that start a voice or video call in a chat. Hidden when calls aren't set up, or while you are in one. */
export function CallButtons({ conversationId }: { conversationId: string }) {
  const { enabled, active, join } = useCall();
  if (!enabled || active) return null;
  return (
    <>
      <Tooltip title="Voice call">
        <IconButton aria-label="Voice call" onClick={() => void join(conversationId, false)}>
          <CallOutlinedIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Video call">
        <IconButton aria-label="Video call" onClick={() => void join(conversationId, true)}>
          <VideocamOutlinedIcon />
        </IconButton>
      </Tooltip>
    </>
  );
}

/** A channel's voice button: drop in, no ringing. */
export function VoiceChannelButton({ conversationId }: { conversationId: string }) {
  const { enabled, active, join } = useCall();
  if (!enabled || active) return null;
  return (
    <Tooltip title="Join voice">
      <IconButton aria-label="Join voice" onClick={() => void join(conversationId, false)}>
        <HeadsetMicOutlinedIcon />
      </IconButton>
    </Tooltip>
  );
}
