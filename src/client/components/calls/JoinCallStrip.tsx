import { Box, Button, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import { useCall } from "../../contexts/CallContext";
import { useChatCall } from "../../hooks/calls/useChatCall";

/** Under a chat's header while a call is going on in it and you aren't in it: who is there, and a button to join. */
export default function JoinCallStrip({
  conversationId,
  voiceChannel,
}: {
  conversationId: string;
  voiceChannel?: boolean;
}) {
  const { enabled, active, join } = useCall();
  const { call, people } = useChatCall(conversationId, enabled);
  if (!enabled || !call || active?.conversationId === conversationId) return null;
  const names = call.participants.map((p) => people.find((x) => x._id === p.userId)?.username ?? "Someone");
  return (
    <Box
      role="status"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 0.5,
        flexShrink: 0,
        bgcolor: "success.main",
        color: "success.contrastText",
      }}
    >
      <CallIcon fontSize="small" aria-hidden />
      <Typography variant="body2" sx={{ flex: 1 }} noWrap>
        {voiceChannel ? "Voice channel" : "Call in progress"} · {names.slice(0, 3).join(", ")}
        {names.length > 3 ? ` and ${names.length - 3} more` : ""}
      </Typography>
      <Button color="inherit" size="small" onClick={() => void join(conversationId, call.video)}>
        Join call
      </Button>
    </Box>
  );
}
