import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  AppBar,
  Toolbar,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useUserMessages, useConversation } from "../../../hooks/user/useUserMessages";
import { Message } from "../../../types/Message";
import { Conversation } from "../../../types/Conversation";
import { ParticipantInfo } from "../../../types/ParticipantInfo";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { useSocket } from "../../../hooks/useSocket";
import { useQueryClient } from "@tanstack/react-query";
import { useConversationSocket } from "../../../hooks/useConversationSocket";
import ConversationHeader from "./components/ConversationHeader";
import ConversationBody from "./components/ConversationBody";
import ConversationFooter from "./components/ConversationFooter";
import SettingsModal from "./components/SettingsModal";
import UsersModal from "./components/UsersModal";
import { getParticipantDisplayById } from "../../../utils/conversationUtils";

export default function ConversationDetail() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const queryClient = useQueryClient();
  const {
    markConversationAsRead,
    sendMessage,
    isSendingMessage,
    deleteMessage,
    isDeletingMessage,
    addParticipants,
    isAddingParticipants,
    removeParticipant,
    isRemovingParticipant,
    updateConversationName,
    isUpdatingName,
    leaveConversation: leaveConversationMutation,
    isLeaving,
  } = useUserMessages();
  
  const { conversation, isLoading } = useConversation(conversationId);
  const { socket, joinConversation, leaveConversation } = useSocket();

  const [messageText, setMessageText] = useState("");
  const [messageOptionsOpen, setMessageOptionsOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);

  useEffect(() => {
    if (conversationId) {
      joinConversation(conversationId);
    }

    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
    };
  }, [conversationId, joinConversation, leaveConversation]);

  // Set up socket listeners for real-time updates
  useConversationSocket({ socket, conversationId });

  useEffect(() => {
    if (conversation && conversationId) {
      markConversationAsRead(conversationId);
    }
  }, [conversation, conversationId]);




  const handleSendMessage = () => {
    if (!conversationId || !messageText.trim() || !conversation) return;

    const messageToSend = messageText.trim();
    sendMessage(conversationId, messageToSend);
    setMessageText("");
    
    // Optimistically update local conversation state immediately
    // Optimistic update is handled by the sendMessage mutation in useUserMessages hook
  };

  const handleMessageOptions = (message: Message) => {
    setSelectedMessage(message);
    setMessageOptionsOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!conversationId || !selectedMessage?._id) return;

    deleteMessage(conversationId, selectedMessage._id);
    setMessageOptionsOpen(false);
    setSelectedMessage(null);
  };

  const handleRemoveParticipant = (participantId: string) => {
    if (!conversationId) return;

    removeParticipant(conversationId, participantId);
  };

  const handleUpdateName = async (name: string) => {
    if (!conversationId) return;
    await updateConversationName(conversationId, name);
    // Update is handled by the mutation and socket events
  };

  const handleLeaveConversation = async () => {
    if (!conversationId) return;
    // Attempt to leave conversation, then navigate regardless of result
    leaveConversationMutation(conversationId).finally(() => {
      navigate("/internal/messages");
    });
  };

  const getMessageSenderName = (message: Message): string => {
    if (message.from === "system" || message.isSystemMessage) {
      return message.from === "system" ? "System" : message.from;
    }
    if (message.from === profile?._id) {
      return message.senderUsername || profile?.username || "You";
    }
    return message.senderUsername || `User ${message.from.substring(0, 8)}`;
  };

  const getMessageSenderAvatar = (message: Message): string | undefined => {
    if (message.from === "system" || message.isSystemMessage) {
      return undefined;
    }
    if (message.from === profile?._id) {
      return profile?.avatar;
    }
    const participant: ParticipantInfo | undefined = conversation?.participantInfo?.find(p => p._id === message.from);
    return participant?.avatar;
  };

  const isSystemMessage = (message: Message): boolean => {
    return message.from === "system" || message.isSystemMessage === true;
  };

  const getParticipantDisplay = (participantId: string): string => {
    return getParticipantDisplayById(participantId, profile?._id, conversation?.participantInfo);
  };

  const isMyMessage = (message: Message): boolean => {
    return message.from === profile?._id;
  };

  const shouldShowAvatar = (currentMessage: Message, previousMessage: Message | null): boolean => {
    if (!previousMessage) return true;
    if (previousMessage.from !== currentMessage.from) return true;
    // Show avatar if more than 5 minutes have passed
    const timeDiff = new Date(currentMessage.time).getTime() - new Date(previousMessage.time).getTime();
    return timeDiff > 5 * 60 * 1000; // 5 minutes
  };

  const shouldShowTimestamp = (currentMessage: Message, nextMessage: Message | null): boolean => {
    if (!nextMessage) return true;
    if (nextMessage.from !== currentMessage.from) return true;
    // Show timestamp if more than 5 minutes have passed
    const timeDiff = new Date(nextMessage.time).getTime() - new Date(currentMessage.time).getTime();
    return timeDiff > 5 * 60 * 1000; // 5 minutes
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner />
        </Box>
      </Box>
    );
  }

  if (!conversation) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <AppBar position="static" color="default" elevation={1}>
          <Toolbar>
            <IconButton edge="start" onClick={() => navigate("/internal/messages")} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" component="div">
              Conversation
            </Typography>
          </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            Conversation not found
          </Typography>
          <Button onClick={() => navigate("/internal/messages")} variant="contained">
            Back to Messages
          </Button>
        </Box>
      </Box>
    );
  }

  const messages = conversation.messages || [];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        overflow: "hidden",
        backgroundColor: "#1e1e1e",
        position: "relative",
        maxHeight: "calc(100vh - 64px)",
      }}
    >
      <ConversationHeader
        conversation={conversation}
        profileId={profile?._id}
        onRemoveParticipant={handleRemoveParticipant}
        getParticipantDisplay={getParticipantDisplay}
        onSettingsClick={() => setSettingsModalOpen(true)}
        onUsersClick={() => setUsersModalOpen(true)}
      />

      <ConversationBody
        messages={messages}
        profileId={profile?._id}
        getMessageSenderName={getMessageSenderName}
        getMessageSenderAvatar={getMessageSenderAvatar}
        isMyMessage={isMyMessage}
        shouldShowAvatar={shouldShowAvatar}
        shouldShowTimestamp={shouldShowTimestamp}
        onMessageOptions={handleMessageOptions}
      />

      <ConversationFooter
        messageText={messageText}
        onMessageTextChange={setMessageText}
        onSendMessage={handleSendMessage}
        isSending={isSendingMessage}
      />

        {/* Message Options Dialog */}
        <Dialog open={messageOptionsOpen} onClose={() => setMessageOptionsOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Message Options</DialogTitle>
          <DialogContent>
            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                color="error"
                onClick={handleDeleteConfirm}
                disabled={isDeletingMessage}
                fullWidth
                sx={{ mb: 2 }}
              >
                {isDeletingMessage ? "Deleting..." : "Delete Message"}
              </Button>
            </Box>
            <Box>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
                Message JSON:
              </Typography>
              <Box
                sx={{
                  backgroundColor: "background.default",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 2,
                  maxHeight: "400px",
                  overflow: "auto",
                }}
              >
                <Typography
                  component="pre"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                  }}
                >
                  {selectedMessage ? JSON.stringify(selectedMessage, null, 2) : ""}
                </Typography>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMessageOptionsOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* Settings modal */}
        <SettingsModal
          open={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          conversation={conversation}
          onUpdateName={handleUpdateName}
          isUpdating={isUpdatingName}
        />

        {/* Users modal */}
        <UsersModal
          open={usersModalOpen}
          onClose={() => setUsersModalOpen(false)}
          conversation={conversation}
          profileId={profile?._id}
          getParticipantDisplay={getParticipantDisplay}
          onLeave={handleLeaveConversation}
          isLeaving={isLeaving}
          onAddParticipant={(participantIds) => {
            if (conversationId) {
              addParticipants(conversationId, participantIds);
            }
          }}
          isAddingParticipants={isAddingParticipants}
        />
    </Box>
  );
}

