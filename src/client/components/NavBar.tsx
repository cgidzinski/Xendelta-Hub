import {
  Box,
  Badge,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  List,
  ListItem,
  Divider,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import ArticleIcon from "@mui/icons-material/Article";
import SettingsIcon from "@mui/icons-material/Settings";
import SecurityIcon from "@mui/icons-material/Security";
import MailIcon from "@mui/icons-material/Mail";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonIcon from "@mui/icons-material/Person";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import LockIcon from "@mui/icons-material/Lock";
import CloseIcon from "@mui/icons-material/Close";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { formatDistance } from "date-fns";
import { useNavBar } from "../contexts/NavBarContext";
import { useUserProfile } from "../hooks/user/useUserProfile";
import { useUserNotifications } from "../hooks/user/useUserNotifications";
import { Notification } from "../types";
import LoadingSpinner from "./LoadingSpinner";
import BaseNavBar, { NavItem } from "./BaseNavBar";
import { useNavBarSocket } from "../hooks/useNavBarSocket";

export default function Root() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isNavBarOpen, setNavBar, toggleNavBar, title } = useNavBar();
  const { profile } = useUserProfile();
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const { notifications, markNotificationAsRead, fetchNotifications, isFetching } = useUserNotifications();
  const markedNotificationsRef = useRef<Set<string>>(new Set());

  useNavBarSocket({
    onNewNotification: () => {
      if (notificationAnchorEl) {
        fetchNotifications();
      }
    },
  });

  const handleNotificationClick = (event: React.MouseEvent<HTMLElement>) => {
    fetchNotifications();
    setNotificationAnchorEl(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchorEl(null);
    markedNotificationsRef.current.clear();
  };

  const handleNotificationHover = (notification: Notification) => {
    if (notification.unread && !markedNotificationsRef.current.has(notification._id)) {
      markedNotificationsRef.current.add(notification._id);
      markNotificationAsRead(notification._id);
    }
  };

  const handleNotificationItemClick = (notification: Notification) => {
    if (notification.unread && !markedNotificationsRef.current.has(notification._id)) {
      markedNotificationsRef.current.add(notification._id);
      markNotificationAsRead(notification._id);
    }
    setSelectedNotification(notification);
    setNotificationModalOpen(true);
  };

  const handleCloseNotificationModal = () => {
    setNotificationModalOpen(false);
    setSelectedNotification(null);
  };

  const getNotificationIcon = (icon: string) => {
    switch (icon) {
      case "person":
        return <PersonIcon />;
      case "security":
        return <SecurityIcon />;
      case "announcement":
        return <AnnouncementIcon />;
      case "mail":
        return <MailIcon />;
      case "lock":
        return <LockIcon />;
      default:
        return <AnnouncementIcon />;
    }
  };

  const navItems: NavItem[] = [
    {
      key: "home",
      label: "Home",
      icon: <HomeIcon />,
      path: "/internal",
      isSelected: (pathname) => pathname === "/internal" || pathname === "/internal/",
    },
    {
      key: "blog",
      label: "Blog",
      icon: <ArticleIcon />,
      path: "/internal/blog",
      isSelected: (pathname) => pathname.startsWith("/internal/blog"),
    },
  ];

  const footerNavItems: NavItem[] = [
    ...(profile?.roles?.some((role: string) => role.toLowerCase() === "admin")
      ? [
          {
            key: "admin",
            label: "Admin",
            icon: <SecurityIcon />,
            path: "/admin",
            isSelected: (pathname) => pathname.endsWith("/admin"),
          },
        ]
      : []),
    {
      key: "settings",
      label: "Settings",
      icon: <SettingsIcon />,
      path: "/internal/settings",
      isSelected: (pathname) => pathname.endsWith("/internal/settings"),
    },
  ];

  return (
    <>
      <BaseNavBar
        title={title}
        isNavBarOpen={isNavBarOpen}
        onToggleNavBar={toggleNavBar}
        navItems={navItems}
        footerNavItems={footerNavItems}
        showNotifications={true}
        showMessages={true}
        onNotificationClick={handleNotificationClick}
        onMessagesClick={() => navigate("/internal/messages")}
        unreadMessages={profile?.unread_messages || false}
        unreadNotifications={profile?.unread_notifications || false}
      >
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <IconButton sx={{ width: 50, height: 50 }} onClick={() => navigate("/internal/messages")}>
            <Badge badgeContent={profile?.unread_messages ? 1 : 0} color="error" variant="dot">
              <MailIcon />
            </Badge>
          </IconButton>
          <IconButton sx={{ width: 50, height: 50, p: 0 }} onClick={handleNotificationClick}>
            <Badge badgeContent={profile?.unread_notifications ? 1 : 0} color="error" variant="dot">
              <NotificationsIcon />
            </Badge>
          </IconButton>
        </Box>
      </BaseNavBar>

      {/* Notifications Popover */}
      <Menu
        open={Boolean(notificationAnchorEl)}
        anchorEl={notificationAnchorEl}
        onClose={handleNotificationClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        slotProps={{
          paper: {
            sx: {
              width: 400,
              maxHeight: 400,
              mt: 1,
            },
          },
        }}
      >
        <Box sx={{ pt: 2 }}>
          <Typography variant="h6" sx={{ mb: 2, mx: 2, fontWeight: "bold" }}>
            Notifications
          </Typography>
          <Divider variant="fullWidth" />
          <List sx={{ p: 0 }}>
            {isFetching && (
              <Box sx={{ py: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", pt: 3 }}>
                  Loading notifications...
                </Typography>
                <LoadingSpinner />
              </Box>
            )}
            {!isFetching && notifications?.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
                No notifications
              </Typography>
            )}
            {!isFetching &&
              notifications?.map((notification, index) => (
                <Box key={notification._id}>
                  <ListItem
                    onMouseEnter={() => handleNotificationHover(notification)}
                    onClick={() => handleNotificationItemClick(notification)}
                    sx={{
                      backgroundColor: notification.unread ? "transparent" : "background.default",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      py: 1,
                      px: 2,
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "action.selected" },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 0.5 }}>
                      <Box sx={{ mr: 1, color: "primary.main" }}>{getNotificationIcon(notification.icon)}</Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: notification.unread ? "bold" : "normal", flexGrow: 1 }}
                      >
                        {notification.title}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 0.5 }}>
                      {notification.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                      {formatDistance(new Date(notification.time), new Date(), { addSuffix: true })}
                    </Typography>
                  </ListItem>
                  {index < notifications.length - 1 && <Divider variant="fullWidth" />}
                </Box>
              ))}
          </List>
        </Box>
      </Menu>

      {/* Notification Detail Modal */}
      <Dialog
        open={notificationModalOpen}
        onClose={handleCloseNotificationModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
          },
        }}
      >
        {selectedNotification && (
          <>
            <DialogTitle sx={{ position: "relative", pr: 5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ color: "primary.main", display: "flex", alignItems: "center" }}>
                  {getNotificationIcon(selectedNotification.icon)}
                </Box>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  {selectedNotification.title}
                </Typography>
              </Box>
              <IconButton
                aria-label="close"
                onClick={handleCloseNotificationModal}
                sx={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {selectedNotification.message}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatDistance(new Date(selectedNotification.time), new Date(), { addSuffix: true })}
              </Typography>
            </DialogContent>
          </>
        )}
      </Dialog>
    </>
  );
}
