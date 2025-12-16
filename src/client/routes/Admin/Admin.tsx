import { useState, useEffect } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  Button,
} from "@mui/material";
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
    sendNotificationToAll,
    isSendingNotification,
    deleteAllMessages,
    isDeletingMessages,
  } = useAdmin();

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

      </Container>
    </Box>
  );
}

