import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Paper,
  Button,
  IconButton,
  Tooltip,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import LockIcon from "@mui/icons-material/Lock";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CloseIcon from "@mui/icons-material/Close";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { formatDistance } from "date-fns";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useUserNotifications, Notification } from "../../../hooks/user/useUserNotifications";
import NotificationModal from "../../../components/notifications/NotificationModal";

const getNotificationIcon = (icon: string) => {
  switch (icon) {
    case "person":
      return <PersonIcon />;
    case "security":
      return <SecurityIcon />;
    case "announcement":
      return <AnnouncementIcon />;
    case "lock":
      return <LockIcon />;
    default:
      return <NotificationsIcon />;
  }
};

export default function Notifications() {
  useTitle("Notifications");
  const { notifications, isLoading, fetchNotifications, markNotificationAsRead, dismissNotification, isDismissing, clearAllNotifications, isClearing } = useUserNotifications();
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const navigate = useNavigate();
  const handleNotificationClick = (notification: Notification) => {
    if (notification.unread) {
      markNotificationAsRead(notification._id);
    }
    if (notification.link) {
      navigate(notification.link);
    } else {
      setSelectedNotification(notification);
    }
  };

  const handleCloseModal = () => {
    setSelectedNotification(null);
  };

  return (
    <Box>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Box>
            <Typography variant="h3" component="h1" gutterBottom>
              Notifications
            </Typography>
            <Typography variant="h6" color="text.secondary">
              View all your notifications
            </Typography>
          </Box>
          {notifications && notifications.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepIcon />}
              onClick={() => clearAllNotifications()}
              disabled={isClearing}
              size="small"
            >
              Clear All
            </Button>
          )}
        </Box>

        <Paper sx={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}>
          {isLoading && notifications?.length === 0 && (
            <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
              <LoadingSpinner />
            </Box>
          )}

          {!isLoading && notifications?.length === 0 && (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography variant="body1" color="text.secondary">
                No notifications yet
              </Typography>
            </Box>
          )}

          {notifications && notifications.length > 0 && (
            <List sx={{ p: 0 }}>
              {notifications.map((notification, index) => (
                <Box key={notification._id}>
                  <ListItem
                    onClick={() => handleNotificationClick(notification)}
                    sx={{
                      cursor: "pointer",
                      backgroundColor: notification.unread
                        ? "rgba(255, 255, 255, 0.05)"
                        : "transparent",
                      "&:hover": { backgroundColor: "action.hover" },
                      py: 2,
                      px: 2,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, color: "primary.main" }}>
                      {getNotificationIcon(notification.icon)}
                    </ListItemIcon>
                    <ListItemText
                      primary={notification.title}
                      secondary={notification.message}
                      primaryTypographyProps={{
                        fontWeight: notification.unread ? "bold" : "normal",
                      }}
                      secondaryTypographyProps={{
                        sx: { mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      {formatDistance(new Date(notification.time), new Date(), { addSuffix: true })}
                    </Typography>
                    <Tooltip title="Dismiss">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(notification._id);
                        }}
                        disabled={isDismissing}
                        sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItem>
                  {index < notifications.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          )}
        </Paper>

        <NotificationModal
          notification={selectedNotification}
          open={Boolean(selectedNotification)}
          onClose={handleCloseModal}
        />
      </Container>
    </Box>
  );
}