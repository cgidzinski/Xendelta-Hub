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
import { cardSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

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
      <Container maxWidth="md" sx={{ mt: { xs: 2, sm: 4 } }}>
        <Box sx={{ mb: { xs: 2, sm: 3 }, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}>
              Notifications
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
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

        {isLoading && notifications?.length === 0 && (
          <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
            <LoadingSpinner />
          </Box>
        )}

        {!isLoading && notifications?.length === 0 && (
          <Box sx={emptyStateSx}>
            <Box sx={emptyStateIconCircleSx}>
              <NotificationsIcon sx={{ fontSize: 32, color: "text.disabled" }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              No notifications yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You're all caught up
            </Typography>
          </Box>
        )}

        {notifications && notifications.length > 0 && (
          <Paper variant="outlined" sx={{ ...cardSx, overflow: "hidden" }}>
            <List sx={{ p: 0 }}>
              {notifications.map((notification, index) => (
                <Box key={notification._id}>
                  <ListItem
                    onClick={() => handleNotificationClick(notification)}
                    sx={{
                      cursor: "pointer",
                      backgroundColor: notification.unread
                        ? "action.hover"
                        : "transparent",
                      "&:hover": { backgroundColor: "action.selected" },
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
          </Paper>
        )}

        <NotificationModal
          notification={selectedNotification}
          open={Boolean(selectedNotification)}
          onClose={handleCloseModal}
        />
      </Container>
    </Box>
  );
}