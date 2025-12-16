import { useState, useEffect } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import NotificationsIcon from "@mui/icons-material/Notifications";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import SecurityIcon from "@mui/icons-material/Security";
import MailIcon from "@mui/icons-material/Mail";
import PersonIcon from "@mui/icons-material/Person";
import LockIcon from "@mui/icons-material/Lock";
import DeleteIcon from "@mui/icons-material/Delete";
import { useTitle } from "../../hooks/useTitle";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useAdmin } from "../../hooks/admin/useAdmin";

export default function Admin() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const {
    verifyAdminRole,
    sendMessageToAll,
    isSendingMessage,
    sendNotificationToAll,
    isSendingNotification,
    deleteAllMessages,
    isDeletingMessages,
  } = useAdmin();
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [testMessage, setTestMessage] = useState("Test Message");
  const [conversationTitle, setConversationTitle] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Periodic role verification - check every 30 seconds
  // Note: AdminRoute already handles initial admin verification, so we only do periodic checks here
  useEffect(() => {
    let isMounted = true;

    const checkAdminRole = async () => {
      const result = await verifyAdminRole();
      const rolesData = result.data || [];
      if (isMounted && !rolesData.some((role: string) => role.toLowerCase() === "admin")) {
        // Admin role was removed, redirect to internal
        navigate("/internal");
        enqueueSnackbar("Your admin access has been revoked", { variant: "warning" });
      }
    };

    // Skip initial verification on mount - AdminRoute already handles this
    // Only set up periodic verification every 30 seconds
    const interval = setInterval(checkAdminRole, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [navigate, enqueueSnackbar, verifyAdminRole]);

  const handleSendToAll = async () => {
    if (!testMessage.trim()) return;

    setResult(null);

    sendMessageToAll(
      { message: testMessage, conversationTitle: conversationTitle.trim() || undefined },
      {
        onSuccess: (data) => {
          setResult({
            success: true,
            message: data.message || `Message sent successfully`,
          });
          setTestMessage("Test Message");
          setConversationTitle("");
          setTimeout(() => {
            setMessageDialogOpen(false);
            setResult(null);
          }, 3000);
        },
        onError: (error) => {
          setResult({
            success: false,
            message: error.message || "Failed to send message",
          });
        },
      }
    );
  };

  const handleSendNotification = async (title: string, message: string, icon: string = "announcement") => {
    sendNotificationToAll({ title, message, icon }, {
      onSuccess: (data) => {
        enqueueSnackbar(data.message || `Notification sent successfully`, {
          variant: "success",
        });
      },
      onError: (error) => {
        enqueueSnackbar(error.message || "Failed to send notification", { variant: "error" });
      },
    });
  };

  const handleDeleteAllMessages = async () => {
    if (!window.confirm("Are you sure you want to delete ALL messages and ALL conversations? This action cannot be undone.")) {
      return;
    }

    deleteAllMessages(undefined, {
      onSuccess: (data) => {
        enqueueSnackbar(data.message || `Deleted messages and conversations`, {
          variant: "success",
        });
      },
      onError: (error) => {
        enqueueSnackbar(error.message || "Failed to delete messages and conversations", { variant: "error" });
      },
    });
  };

  const demoNotifications = [
    {
      title: "Welcome Message",
      message: "Welcome to our platform! We're excited to have you here.",
      icon: "announcement",
      color: "primary" as const,
    },
    {
      title: "Security Alert",
      message: "Please update your password for better security.",
      icon: "security",
      color: "warning" as const,
    },
    {
      title: "New Feature",
      message: "Check out our new messaging feature! Start a conversation with your team.",
      icon: "mail",
      color: "info" as const,
    },
    {
      title: "Profile Update",
      message: "Don't forget to complete your profile to get the best experience.",
      icon: "person",
      color: "secondary" as const,
    },
    {
      title: "Maintenance Notice",
      message: "Scheduled maintenance will occur tonight from 2 AM to 4 AM EST.",
      icon: "lock",
      color: "error" as const,
    },
  ];

  useTitle("General");

  return (
    <Box>
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            General
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Administrative functions and controls
          </Typography>
        </Box>

        {/* Message All Users Card */}
        <Card elevation={3} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h5" gutterBottom>
            Broadcast Messages
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Send a message to all users in the system. System messages cannot be replied to.
          </Typography>
          <Button
            variant="contained"
            startIcon={<SendIcon />}
            onClick={() => setMessageDialogOpen(true)}
            size="large"
          >
            Message All Users
          </Button>
        </Card>

        {/* Demo Notifications Card */}
        <Card elevation={3} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Demo Notifications
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Send pre-configured demo notifications to all users. These are useful for testing the notification system.
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {demoNotifications.map((demo, index) => {
              const IconComponent =
                demo.icon === "announcement"
                  ? AnnouncementIcon
                  : demo.icon === "security"
                  ? SecurityIcon
                  : demo.icon === "mail"
                  ? MailIcon
                  : demo.icon === "person"
                  ? PersonIcon
                  : demo.icon === "lock"
                  ? LockIcon
                  : NotificationsIcon;

              return (
                <Button
                  key={index}
                  variant="outlined"
                  color={demo.color}
                  startIcon={<IconComponent />}
                  onClick={() => handleSendNotification(demo.title, demo.message, demo.icon)}
                  disabled={isSendingNotification}
                  sx={{ minWidth: 200 }}
                >
                  {demo.title}
                </Button>
              );
            })}
          </Box>
        </Card>

        {/* Delete All Messages Card */}
        <Card elevation={3} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h5" gutterBottom color="error">
            Danger Zone
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Permanently delete all messages and all conversations. This action cannot be undone.
          </Typography>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleDeleteAllMessages}
            disabled={isDeletingMessages}
            size="large"
          >
            {isDeletingMessages ? "Deleting..." : "Delete All Messages"}
          </Button>
        </Card>

        {/* Message Dialog */}
        <Dialog open={messageDialogOpen} onClose={() => setMessageDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Send Message to All Users</DialogTitle>
          <DialogContent>
            {result && (
              <Alert severity={result.success ? "success" : "error"} sx={{ mb: 2 }}>
                {result.message}
              </Alert>
            )}
            <TextField
              fullWidth
              label="Conversation Title (optional)"
              placeholder="e.g., Sales, Support, Admin"
              value={conversationTitle}
              onChange={(e) => setConversationTitle(e.target.value)}
              sx={{ mt: 2 }}
              helperText="Leave empty to use default conversation name"
            />
            <TextField
              fullWidth
              label="Message"
              placeholder="Type your message..."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              multiline
              rows={4}
              sx={{ mt: 2 }}
              required
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              This message will be sent to all users and cannot be replied to.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMessageDialogOpen(false)} disabled={isSendingMessage}>
              Cancel
            </Button>
            <Button
              onClick={handleSendToAll}
              variant="contained"
              disabled={isSendingMessage || !testMessage.trim()}
            >
              {isSendingMessage ? "Sending..." : "Send to All"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}

