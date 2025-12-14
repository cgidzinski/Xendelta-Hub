import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
  Badge,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  Chip,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { formatDistance } from "date-fns";
import AddIcon from "@mui/icons-material/Add";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useUserMessages, Conversation } from "../../../hooks/user/useUserMessages";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { useSocket } from "../../../hooks/useSocket";
import { useQueryClient } from "@tanstack/react-query";
import { getParticipantDisplay } from "../../../utils/conversationUtils";
import StackedAvatars from "./components/StackedAvatars";
import { get } from "../../../utils/apiClient";
import { useSnackbar } from "notistack";

interface User {
  _id: string;
  username: string;
  email: string;
}

export default function Messages() {
  useTitle("Messages");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { conversations, isLoading, isFetching, isError, error, createConversation, isCreatingConversation } = useUserMessages();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const { socket } = useSocket();
  const { enqueueSnackbar } = useSnackbar();
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [initialMessage, setInitialMessage] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (newConversationOpen) {
      fetchUsers();
    }
  }, [newConversationOpen]);

  // Set up socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { conversationId: string; message: any }) => {
      // Check if this is a system message - backend sends senderUsername: "System" for system messages
      const isSystemMessage = data.message.senderUsername === "System" || data.message.isSystemMessage || data.message.from === "system";
      
      // Force refetch conversations list when new message arrives
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();
      
      // Show notification for system messages
      if (isSystemMessage) {
        const messagePreview = data.message.message?.substring(0, 50) || "New system message";
        enqueueSnackbar(`System message: ${messagePreview}${data.message.message?.length > 50 ? '...' : ''}`, {
          variant: "info",
          autoHideDuration: 5000,
        });
      }
    };

    const handleNewConversation = (data: { conversation: Conversation }) => {
      // Check if this is a system conversation
      const isSystemConversation = data.conversation.participants?.includes("system") || data.conversation.name === "System Messages";
      
      // Force refetch conversations list when new conversation is created
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();
      
      // Show notification for system conversations
      if (isSystemConversation) {
        enqueueSnackbar("You have received a new system message", {
          variant: "info",
          autoHideDuration: 5000,
        });
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("conversation:new", handleNewConversation);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:new", handleNewConversation);
    };
  }, [socket, queryClient, refetchProfile, enqueueSnackbar]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await get<{ users: User[] }>("/api/users");
      // Filter out current user
      const otherUsers = data.users.filter((user: User) => user._id !== profile?._id);
      setUsers(otherUsers);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
    setLoadingUsers(false);
  };


  const handleCreateConversation = () => {
    if (selectedUsers.length === 0) return;

    const participantIds = selectedUsers.map((user) => user._id);
    
    createConversation(participantIds, initialMessage.trim() || undefined);
    setNewConversationOpen(false);
    setSelectedUsers([]);
    setInitialMessage("");
    
    // Wait for mutation to complete, then find and navigate to the new conversation
    // The mutation's onSuccess will invalidate queries, so we wait a bit for that to complete
    setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["userConversations"] }).then(() => {
        const updatedConversations = queryClient.getQueryData<Conversation[]>(["userConversations"]);
        const newConv = updatedConversations?.find((conv) => 
          participantIds.every((id) => conv.participants.includes(id)) &&
          conv.participants.length === participantIds.length + 1 // +1 for current user
        );
        if (newConv) {
          navigate(`/internal/messages/${newConv._id}`);
        }
      });
    }, 300);
  };

  return (
    <Box>
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box>
            <Typography variant="h3" component="h1" gutterBottom>
              Messages
            </Typography>
            <Typography variant="h6" color="text.secondary">
              Manage your conversations and messages
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewConversationOpen(true)}
            sx={{ mt: 1 }}
          >
            New Message
          </Button>
        </Box>

        <Card elevation={0} sx={{ backgroundColor: "transparent" }}>
          <Box>
            {isLoading && (
              <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
                <LoadingSpinner />
              </Box>
            )}
            
            {isError && (
              <Box sx={{ py: 3, textAlign: "center" }}>
                <Typography variant="body2" color="error">
                  {error?.message || "Failed to load conversations"}
                </Typography>
              </Box>
            )}

            {!isLoading && !isError && (
              <List sx={{ p: 1 }}>
                {conversations && conversations.length > 0 ? (
                  conversations.map((conversation, index) => (
                    <Box key={conversation._id} sx={{p:0  ,m:0}}>
                      <ListItem
                        onClick={() => navigate(`/internal/messages/${conversation._id}`)}
                        sx={{
                          position: "relative",
                          "&:hover": { 
                            backgroundColor: "rgba(255, 255, 255, 0.1)", 
                            cursor: "pointer",
                            transform: "translateX(4px)",
                            transition: "all 0.2s ease",
                          },
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          py: 1.5,
                          px: 2,
                          mb: 0.5,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        {conversation.unread && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: 8,
                              right: 8,
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: "error.main",
                              zIndex: 1,
                            }}
                          />
                        )}
                        <ListItemIcon>
                          <StackedAvatars
                            conversation={conversation}
                            currentUserId={profile?._id}
                            maxAvatars={10}
                            size={48}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primaryTypographyProps={{ component: "div" }}
                          secondaryTypographyProps={{ component: "div" }}
                          primary={
                            <Box component="div" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                              <Typography
                                variant="body1"
                                sx={{
                                  fontWeight: "600",
                                  flex: 1,
                                  color: "text.primary",
                                }}
                              >
                                {conversation.name || getParticipantDisplay(conversation, profile?._id)}
                              </Typography>
                              <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.9 }}>
                                {formatDistance(new Date(conversation.lastMessageTime), new Date(), {
                                  addSuffix: true,
                                })}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Box component="div" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mt: 0.5 }}>
                              <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, opacity: 0.95 }}>
                                {conversation.lastMessage || "No messages yet"}
                              </Typography>
                              <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.8 }}>
                                {getParticipantDisplay(conversation)}
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItem>
                    </Box>
                  ))
                ) : (
                  <Box sx={{ py: 3, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      No conversations yet
                    </Typography>
                  </Box>
                )}
              </List>
            )}
          </Box>
        </Card>

        {/* New Conversation Dialog */}
        <Dialog open={newConversationOpen} onClose={() => setNewConversationOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Start New Conversation</DialogTitle>
          <DialogContent>
            <Autocomplete
              multiple
              options={users}
              getOptionLabel={(option) => option.username}
              value={selectedUsers}
              onChange={(event, newValue) => {
                setSelectedUsers(newValue);
              }}
              loading={loadingUsers}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Participants"
                  placeholder="Search users..."
                  sx={{ mt: 2 }}
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    label={option.username}
                    {...getTagProps({ index })}
                    key={option._id}
                  />
                ))
              }
            />
            <TextField
              fullWidth
              label="Initial Message (optional)"
              placeholder="Type your first message..."
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              multiline
              rows={3}
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewConversationOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateConversation}
              variant="contained"
              disabled={isCreatingConversation || selectedUsers.length === 0}
            >
              {isCreatingConversation ? "Creating..." : "Create Conversation"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
