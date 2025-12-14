import { Outlet } from "react-router-dom";
import {
  Box,
  Typography,
  Drawer,
  Toolbar,
  List,
  Divider,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  IconButton,
  ListItemAvatar,
  Avatar,
  Badge,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import { useNavBar } from "../contexts/NavBarContext";
import CssBaseline from "@mui/material/CssBaseline";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import NotificationsIcon from "@mui/icons-material/Notifications";
import MenuIcon from "@mui/icons-material/Menu";
import MailIcon from "@mui/icons-material/Mail";
import SettingsIcon from "@mui/icons-material/Settings";
import LockIcon from "@mui/icons-material/Lock";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import CloseIcon from "@mui/icons-material/Close";
import ArticleIcon from "@mui/icons-material/Article";
const DRAWER_WIDTH = 240;
import { useUserProfile } from "../hooks/user/useUserProfile";
import { useState, useRef, useEffect } from "react";
import { useUserNotifications } from "../hooks/user/useUserNotifications";
import { Notification } from "../types";
import LoadingSpinner from "./LoadingSpinner";
import { formatDistance } from "date-fns";
import ProfileListItem from "./ProfileListItem";
import { useSocket } from "../hooks/useSocket";
export default function Root() {
  let location = useLocation();
  const navigate = useNavigate();
  const { isNavBarOpen, setNavBar, toggleNavBar, title } = useNavBar();
  const { profile } = useUserProfile();
  const { socket } = useSocket();
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const { notifications, markNotificationAsRead, fetchNotifications, isFetching } = useUserNotifications();
  const markedNotificationsRef = useRef<Set<string>>(new Set());

  const { refetch: refetchProfile } = useUserProfile();

  // Listen for real-time notification updates
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = () => {
      // If notification menu is open, refresh notifications
      if (notificationAnchorEl) {
        fetchNotifications();
      }
    };

    // Listen for new messages to update unread count
    const handleNewMessage = () => {
      refetchProfile();
    };

    // Listen for new conversations to update unread count
    const handleNewConversation = () => {
      refetchProfile();
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("message:new", handleNewMessage);
    socket.on("conversation:new", handleNewConversation);

    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:new", handleNewConversation);
    };
  }, [socket, notificationAnchorEl, fetchNotifications, refetchProfile]);

  const handleNotificationClick = (event: React.MouseEvent<HTMLElement>) => {
    fetchNotifications(); // Fetch notifications when button is clicked
    setNotificationAnchorEl(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchorEl(null);
    // Reset the marked notifications set when closing the menu
    markedNotificationsRef.current.clear();
  };

  const handleNotificationHover = (notification: Notification) => {
    if (notification.unread && !markedNotificationsRef.current.has(notification._id)) {
      markedNotificationsRef.current.add(notification._id);
      markNotificationAsRead(notification._id);
    }
  };

  const handleNotificationItemClick = (notification: Notification) => {
    // Mark as read if unread
    if (notification.unread && !markedNotificationsRef.current.has(notification._id)) {
      markedNotificationsRef.current.add(notification._id);
      markNotificationAsRead(notification._id);
    }
    // Open modal with full notification details
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

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <Drawer
        sx={{
          width: isNavBarOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            top: 0,
          },
        }}
        variant="persistent"
        anchor="left"
        open={isNavBarOpen}
      >
        <Box sx={{ overflow: "auto", display: "flex", flexDirection: "column", height: "100%" }}>
          <Box
            sx={{
              height: 64, // Same height as AppBar Toolbar
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderBottom: "1px solid",
              borderColor: "divider",
              cursor: "pointer",
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
            onClick={() => navigate("/internal")}
          >
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                background: "linear-gradient(90deg, #00f5ff 0%, #00d4ff 50%, #00a8ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              XenDelta
            </Typography>
          </Box>
          <List>
            <ListItem key={"home"} disablePadding>
              <ListItemButton
                onClick={() => navigate("/internal")}
                selected={location.pathname === "/internal" || location.pathname === "/internal/"}
              >
                <ListItemIcon>
                  <HomeIcon />
                </ListItemIcon>
                <ListItemText primary={"Home"} />
              </ListItemButton>
            </ListItem>
            <ListItem key={"blog"} disablePadding>
              <ListItemButton
                onClick={() => navigate("/internal/blog")}
                selected={location.pathname.startsWith("/internal/blog")}
              >
                <ListItemIcon>
                  <ArticleIcon />
                </ListItemIcon>
                <ListItemText primary={"Blog"} />
              </ListItemButton>
            </ListItem>
          </List>

          <Box sx={{ marginTop: "auto" }}>
            <List>
              {profile?.roles?.includes("admin") && (
                <ListItem key={"admin"} disablePadding>
                  <ListItemButton onClick={() => navigate("/admin")} selected={location.pathname.endsWith("/admin")}>
                    <ListItemIcon>
                      <SecurityIcon />
                    </ListItemIcon>
                    <ListItemText primary={"Admin"} />
                  </ListItemButton>
                </ListItem>
              )}
              <ListItem key={"settings"} disablePadding>
                <ListItemButton
                  onClick={() => navigate("/internal/settings")}
                  selected={location.pathname.endsWith("/internal/settings")}
                >
                  <ListItemIcon>
                    <SettingsIcon />
                  </ListItemIcon>
                  <ListItemText primary={"Settings"} />
                </ListItemButton>
              </ListItem>
              <Divider variant="middle" component="li" sx={{ my: 1 }} />
              <ProfileListItem />
            </List>
          </Box>
        </Box>
      </Drawer>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          width: isNavBarOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : "100%",
          ml: isNavBarOpen ? `${DRAWER_WIDTH}px` : 0,
          transition: (theme) =>
            theme.transitions.create(["width", "margin-left"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={toggleNavBar}
            edge="start"
            sx={{
              mr: 2,
            }}
          >
            {isNavBarOpen ? <MenuIcon /> : <MenuIcon />}
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }} onClick={() => setNavBar(true)}>
            {title}
          </Typography>
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
        </Toolbar>
      </AppBar>

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
        sx={{
          "& .MuiPopover-paper": {
            right: 0,
            left: "auto !important",
          },
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
                    key={notification._id}
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
                      <Box sx={{ mr: 1, color: "primary.main" }}>
                        {notification.icon == "person" && <PersonIcon />}
                        {notification.icon == "security" && <SecurityIcon />}
                        {notification.icon == "announcement" && <AnnouncementIcon />}
                        {notification.icon == "mail" && <MailIcon />}
                        {notification.icon == "lock" && <LockIcon />}
                      </Box>
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
                  {index < notifications?.length - 1 && <Divider variant="fullWidth" sx={{}} />}
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
                  color: (theme) => theme.palette.grey[500],
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

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: "100%",
          ml: 0,
          transition: (theme) =>
            theme.transitions.create(["width", "margin-left"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
