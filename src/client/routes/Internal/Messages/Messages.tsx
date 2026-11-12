import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useTitle } from "../../../hooks/useTitle";
import EmptyState from "../../../components/ui/EmptyState";
import ConversationList from "./components/ConversationList";
import NewChatDialog from "./components/NewChatDialog";
import Thread from "./Thread";

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

  const open = (id: string) => navigate(`/internal/messages/${id}`);
  const showList = !phone || !conversationId;
  const showThread = !phone || !!conversationId;

  return (
    <Box
      sx={{
        display: "flex",
        height: { xs: "calc(100dvh - 56px)", sm: "calc(100dvh - 64px)" },
        borderTop: { md: 0 },
        overflow: "hidden",
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
