import { useEffect, useState } from "react";
import { Box, Button, Divider, Drawer, IconButton, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { chatTitle } from "@shared/chat";
import { useAuth } from "../../../contexts/AuthContext";
import { CHAT_CALLS_ENABLED } from "../../../constants/chat";
import { useConversation } from "../../../hooks/chat/useChat";
import EmptyState from "../../../components/ui/EmptyState";
import ChatAvatar from "./components/ChatAvatar";
import DetailsPanel from "./components/DetailsPanel";
import AddPeopleDialog from "./components/AddPeopleDialog";
import ChatPane from "./components/ChatPane";

interface ThreadProps {
  conversationId: string;
  /** Goes back to the list (a phone shows one pane at a time). */
  onBack: () => void;
}

/** One conversation: its header, history, composer and details. */
export default function Thread({ conversationId, onBack }: ThreadProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("lg"));
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const { user } = useAuth();

  const conversationQuery = useConversation(conversationId);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const conversation = conversationQuery.data;

  // Switching chats closes the details.
  useEffect(() => {
    setDetailsOpen(false);
  }, [conversationId]);

  if (conversationQuery.isError) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 2,
        }}
      >
        <EmptyState
          title="This chat isn't available"
          description="It may have been deleted, or you may no longer be in it."
        />
        <Button variant="contained" onClick={onBack}>
          Back to messages
        </Button>
      </Box>
    );
  }
  if (!conversation) {
    return <Box sx={{ p: 3 }} aria-busy />;
  }

  const title = chatTitle(conversation, user.id);
  const others = conversation.people.filter((p) => p._id !== user.id);
  const subtitleFor = (typingNames: string[]) =>
    typingNames.length > 0
      ? `${typingNames.join(", ")} typing…`
      : conversation.members.length > 2
        ? `${conversation.members.length} members`
        : others[0]
          ? ""
          : "Just you";

  const details = (
    <DetailsPanel
      conversation={conversation}
      meId={user.id}
      onAddPeople={() => setAddOpen(true)}
      onLeft={() => {
        setDetailsOpen(false);
        onBack();
      }}
    />
  );

  const header = ({ typingNames }: { typingNames: string[] }) => {
    const subtitle = subtitleFor(typingNames);
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: { xs: 1, md: 2.5 },
          // The chat covers the whole screen on a phone, so its header clears the status bar in an installed app.
          pt: "env(safe-area-inset-top)",
          minHeight: 68,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {phone && (
          <IconButton onClick={onBack} aria-label="Back to chats" edge="start">
            <ArrowBackIcon />
          </IconButton>
        )}
        <ChatAvatar conversation={conversation} meId={user.id} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {CHAT_CALLS_ENABLED && (
          <>
            <Tooltip title="Voice call">
              <IconButton aria-label="Voice call">
                <CallOutlinedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Video call">
              <IconButton aria-label="Video call">
                <VideocamOutlinedIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="Add people">
          <IconButton onClick={() => setAddOpen(true)} aria-label="Add people">
            <PersonAddAltIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Chat details">
          <IconButton
            onClick={() => setDetailsOpen((v) => !v)}
            aria-label="Chat details"
            color={detailsOpen ? "primary" : "default"}
          >
            <InfoOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      <ChatPane
        conversationId={conversationId}
        conversation={conversation}
        title={title}
        header={header}
        emojiScope={{ type: "chat", id: conversationId }}
        emptyDescription={`Say hello to ${title}.`}
      />

      {detailsOpen && wide && (
        <>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ width: 320, flexShrink: 0 }}>{details}</Box>
        </>
      )}
      {detailsOpen && !wide && (
        <Drawer
          anchor="right"
          open
          onClose={() => setDetailsOpen(false)}
          slotProps={{ paper: { sx: { width: { xs: "100%", sm: 360 } } } }}
        >
          <Box sx={{ display: "flex", justifyContent: "flex-start", p: 1 }}>
            <IconButton onClick={() => setDetailsOpen(false)} aria-label="Close details">
              <ArrowBackIcon />
            </IconButton>
          </Box>
          {details}
        </Drawer>
      )}

      <AddPeopleDialog open={addOpen} onClose={() => setAddOpen(false)} conversation={conversation} />
    </Box>
  );
}
