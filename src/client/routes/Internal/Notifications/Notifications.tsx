import PageContainer from "../../../components/ui/PageContainer";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
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
  Chip,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import LockIcon from "@mui/icons-material/Lock";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CloseIcon from "@mui/icons-material/Close";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { formatDistance } from "date-fns";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useUserNotifications, Notification } from "../../../hooks/user/useUserNotifications";
import NotificationModal from "../../../components/notifications/NotificationModal";
import { cardSx } from "../../../components/ui/surfaceStyles";
import EmptyState from "../../../components/ui/EmptyState";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { APPS_REGISTRY } from "../../../constants/apps";

/** The app a notification came from, read off its link ("/internal/xensplit/..."), or null for hub notices. */
const appOf = (n: Notification) =>
  APPS_REGISTRY.find((a) => n.link === a.path || n.link?.startsWith(`${a.path}/`)) ?? null;

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
  const {
    notifications,
    isLoading,
    fetchNotifications,
    markNotificationAsRead,
    markAllAsRead,
    isMarkingAsRead,
    dismissNotification,
    isDismissing,
    clearAllNotifications,
    isClearing,
  } = useUserNotifications();
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [appFilter, setAppFilter] = useState<string | null>(null);
  const confirm = useConfirm();

  const apps = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of notifications ?? []) {
      const app = appOf(n);
      if (app) seen.set(app.key, app.label);
    }
    return [...seen];
  }, [notifications]);
  // An app whose notifications were all dismissed drops out of the chips, so stop filtering by it.
  const activeApp = apps.some(([key]) => key === appFilter) ? appFilter : null;
  const visible = useMemo(
    () => (notifications ?? []).filter((n) => (!onlyUnread || n.unread) && (!activeApp || appOf(n)?.key === activeApp)),
    [notifications, onlyUnread, activeApp],
  );
  const unreadCount = (notifications ?? []).filter((n) => n.unread).length;

  const handleClearAll = async () => {
    const ok = await confirm({ title: "Clear all notifications?", message: "They'll be removed for good." });
    if (ok) clearAllNotifications();
  };

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
      <PageContainer width="narrow">
        <Box sx={{ mb: { xs: 2, sm: 3 }, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}>
              Notifications
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              View all your notifications
            </Typography>
          </Box>
          {unreadCount > 0 && (
            <Button
              variant="outlined"
              startIcon={<DoneAllIcon />}
              onClick={() => markAllAsRead()}
              disabled={isMarkingAsRead}
              size="small"
            >
              Mark all read
            </Button>
          )}
        </Box>

        {isLoading && notifications?.length === 0 && (
          <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
            <LoadingSpinner />
          </Box>
        )}

        {!isLoading && notifications?.length === 0 && (
          <EmptyState icon={<NotificationsIcon />} title="No notifications yet" description="You're all caught up" />
        )}

        {notifications && notifications.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
            <Chip
              label={`Unread${unreadCount ? ` (${unreadCount})` : ""}`}
              color={onlyUnread ? "primary" : "default"}
              variant={onlyUnread ? "filled" : "outlined"}
              onClick={() => setOnlyUnread((v) => !v)}
            />
            {apps.map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                color={activeApp === key ? "primary" : "default"}
                variant={activeApp === key ? "filled" : "outlined"}
                onClick={() => setAppFilter(activeApp === key ? null : key)}
              />
            ))}
          </Box>
        )}

        {notifications && notifications.length > 0 && visible.length === 0 && (
          <EmptyState icon={<NotificationsIcon />} title="Nothing matches" description="Try clearing a filter" />
        )}

        {visible.length > 0 && (
          <Paper variant="outlined" sx={{ ...cardSx, overflow: "hidden" }}>
            <List sx={{ p: 0 }}>
              {visible.map((notification, index) => (
                <Box key={notification._id}>
                  <ListItem
                    onClick={() => handleNotificationClick(notification)}
                    sx={{
                      cursor: "pointer",
                      backgroundColor: notification.unread ? "action.hover" : "transparent",
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
                        sx: {
                          mt: 0.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 400,
                        },
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
                  {index < visible.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </Paper>
        )}

        {notifications && notifications.length > 0 && (
          <Box sx={{ mt: 2, textAlign: "center" }}>
            <Button color="inherit" size="small" onClick={handleClearAll} disabled={isClearing} sx={{ opacity: 0.7 }}>
              Clear all notifications
            </Button>
          </Box>
        )}

        <NotificationModal
          notification={selectedNotification}
          open={Boolean(selectedNotification)}
          onClose={handleCloseModal}
        />
      </PageContainer>
    </Box>
  );
}
