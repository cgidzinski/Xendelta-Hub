import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Badge,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Avatar,
  InputAdornment,
  IconButton,
  Tooltip,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { formatDistance } from "date-fns";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useUserMessages, Conversation } from "../../../hooks/user/useUserMessages";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { useUsers, User } from "../../../hooks/user/useUsers";
import { useSocket } from "../../../hooks/useSocket";
import { useQueryClient } from "@tanstack/react-query";
import { getParticipantDisplay } from "../../../utils/conversationUtils";
import StackedAvatars from "./components/StackedAvatars";
import { useSnackbar } from "notistack";

export default function Messages() {
  useTitle("Messages");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { conversations, isLoading, isError, error, createConversation, isCreatingConversation } = useUserMessages();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const { socket } = useSocket();
  const { enqueueSnackbar } = useSnackbar();
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { users, isLoading: loadingUsers } = useUsers();

  // Filter users by search query
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const query = searchQuery.toLowerCase();
    return users.filter((user) => user.username.toLowerCase().includes(query));
  }, [users, searchQuery]);

  // Set up socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { conversationId: string; message: any }) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();
    };

    const handleNewConversation = (data: { conversation: Conversation }) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();
    };

    socket.on("message:new", handleNewMessage);
    socket.on("conversation:new", handleNewConversation);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:new", handleNewConversation);
    };
  }, [socket, queryClient, refetchProfile]);

  const handleCreateConversation = () => {
    if (selectedUsers.length === 0) return;

    const participantIds = selectedUsers.map((user) => user._id);

    createConversation(participantIds);
    setNewConversationOpen(false);
    setSelectedUsers([]);
    setSearchQuery("");

    setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["userConversations"] }).then(() => {
        const updatedConversations = queryClient.getQueryData<Conversation[]>(["userConversations"]);
        const newConv = updatedConversations?.find(
          (conv) =>
            participantIds.every((id) => conv.participants.includes(id)) &&
            conv.participants.length === participantIds.length + 1
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
                    <Box key={conversation._id} sx={{ p: 0, m: 0 }}>
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
                          borderRadius: 4,
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
            <TextField
              fullWidth
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ mt: 1, mb: 2 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery("")}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ minHeight: 200, maxHeight: 300, overflow: "auto" }}>
              {loadingUsers ? (
                <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
                  <CircularProgress size={24} />
                </Box>
              ) : filteredUsers.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                  No users found
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, pt: 1 }}>
                  {filteredUsers.map((user) => {
                    const isSelected = selectedUsers.some((u) => u._id === user._id);
                    return (
                      <Box
                        key={user._id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedUsers(selectedUsers.filter((u) => u._id !== user._id));
                          } else {
                            setSelectedUsers([...selectedUsers, user]);
                          }
                        }}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 1,
                          p: 1.5,
                          cursor: "pointer",
                          borderRadius: 4,
                          border: "1px solid",
                          borderColor: isSelected ? "primary.main" : "divider",
                          backgroundColor: "action.hover",
                          "&:hover": {
                            backgroundColor: "background.paper",
                          },
                          width: 100,
                        }}
                      >
                        <Avatar src={user.avatar} sx={{ width: 56, height: 56 }}>
                          {user.username.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography variant="body2" sx={{ textAlign: "center", fontWeight: isSelected ? 600 : 400 }}>
                          {user.username}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setNewConversationOpen(false); setSelectedUsers([]); setSearchQuery(""); }}>Cancel</Button>
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