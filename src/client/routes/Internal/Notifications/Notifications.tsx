import { useEffect, useState } from "react";
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
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import LockIcon from "@mui/icons-material/Lock";
import NotificationsIcon from "@mui/icons-material/Notifications";
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
  const { notifications, isLoading, fetchNotifications, markNotificationAsRead } = useUserNotifications();
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    if (notification.unread) {
      markNotificationAsRead(notification._id);
    }
    setSelectedNotification(notification);
  };

  const handleCloseModal = () => {
    setSelectedNotification(null);
  };

  return (
    <Box>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Notifications
          </Typography>
          <Typography variant="h6" color="text.secondary">
            View all your notifications
          </Typography>
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
                    <Typography variant="caption" color="text.secondary">
                      {formatDistance(new Date(notification.time), new Date(), { addSuffix: true })}
                    </Typography>
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