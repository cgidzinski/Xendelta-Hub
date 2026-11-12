import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useTitle } from "../../../hooks/useTitle";
import { useVisualViewport } from "../../../hooks/useVisualViewport";
import EmptyState from "../../../components/ui/EmptyState";
import ConversationList from "./components/ConversationList";
import NewChatDialog from "./components/NewChatDialog";
import Thread from "./Thread";
import { chatShellStyle } from "./chatLayout";

/**
 * Messages: the conversation list and one open conversation. On a wide screen they sit side by side; on a phone one
 * shows at a time. `/internal/messages` is the list, `/internal/messages/:conversationId` the chat.
 */
export default function Messages() {
  useTitle("Messages");
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const [newOpen, setNewOpen] = useState(false);
  const viewport = useVisualViewport();
  const landscape = useMediaQuery("(orientation: landscape)");

  // On a phone the screen is pinned to the visible area (see chatLayout.ts), so the page behind it must not scroll.
  useEffect(() => {
    if (!phone) return;
    const html = document.documentElement;
    const body = document.body;
    const before = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      [html.style.overflow, body.style.overflow] = before;
    };
  }, [phone]);

  const open = (id: string) => navigate(`/internal/messages/${id}`);
  const showList = !phone || !conversationId;
  const showThread = !phone || !!conversationId;

  return (
    <Box
      sx={{
        display: "flex",
        ...chatShellStyle({ phone, inThread: !!conversationId, viewport, landscape, zIndex: theme.zIndex.modal - 10 }),
      }}
    >
      {showList && (
        <Box
          sx={{
            width: { xs: "100%", md: 360 },
            flexShrink: 0,
            borderRight: { md: 1 },
            borderColor: "divider",
            minHeight: 0,
          }}
        >
          <ConversationList selectedId={conversationId} onSelect={open} onNewChat={() => setNewOpen(true)} />
        </Box>
      )}
      {showThread && (
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {conversationId ? (
            <Thread
              key={conversationId}
              conversationId={conversationId}
              onBack={() => navigate("/internal/messages")}
            />
          ) : (
            <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <EmptyState
                icon={<ChatBubbleOutlineIcon />}
                title="Select a chat"
                description="Pick a conversation, or start a new one."
              />
            </Box>
          )}
        </Box>
      )}
      <NewChatDialog open={newOpen} onClose={() => setNewOpen(false)} onOpened={open} />
    </Box>
  );
}
