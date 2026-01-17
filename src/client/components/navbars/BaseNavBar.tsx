import { Outlet } from "react-router-dom";
import {
  Box,
  Typography,
  Drawer,
  Toolbar,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  IconButton,
  Divider,
  Badge,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import MailIcon from "@mui/icons-material/Mail";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonIcon from "@mui/icons-material/Person";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import SecurityIcon from "@mui/icons-material/Security";
import LockIcon from "@mui/icons-material/Lock";
import CloseIcon from "@mui/icons-material/Close";
import CssBaseline from "@mui/material/CssBaseline";
import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { formatDistance } from "date-fns";
import ProfileListItem from "../ProfileListItem";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import { useUserNotifications } from "../../hooks/user/useUserNotifications";
import { useNavBarSocket } from "../../hooks/useNavBarSocket";
import { Notification } from "../../types/Notification";
import LoadingSpinner from "../LoadingSpinner";
import PointsListItem from "../PointsListItem";

const DRAWER_WIDTH = 240;

export interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  isSelected: (pathname: string) => boolean;
  type?: "item" | "divider" | "header" | "nested";
  indent?: boolean;
}

interface BaseNavBarProps {
  title: string;
  isNavBarOpen: boolean;
  onToggleNavBar: () => void;
  navItems: NavItem[];
  footerNavItems?: NavItem[];
  showNotifications?: boolean;
  showMessages?: boolean;
  showSystemMessageNotifications?: boolean;
  messagesPath?: string;
  drawerHeaderPath?: string;
  drawerHeaderText?: string;
  showProfile?: boolean;
  showPoints?: boolean;
  children?: React.ReactNode;
}

export default function BaseNavBar({
  title,
  isNavBarOpen,
  onToggleNavBar,
  navItems,
  footerNavItems = [],
  showNotifications = false,
  showMessages = false,
  showSystemMessageNotifications = false,
  messagesPath = "/internal/messages",
  drawerHeaderPath = "/internal",
  drawerHeaderText = "XenDelta Hub",
  showProfile = true,
  showPoints = true,
  children,
}: BaseNavBarProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { profile } = useUserProfile();

  // Notification state
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const { notifications, markNotificationAsRead, fetchNotifications, isFetching } = useUserNotifications();
  const markedNotificationsRef = useRef<Set<string>>(new Set());

  useNavBarSocket({
    showSystemMessageNotifications,
    onNewNotification: () => {
      if (notificationAnchorEl) {
        fetchNotifications();
      }
    },
  });

  const handleNavItemClick = (path: string) => {
    navigate(path);
    if (isMobile && isNavBarOpen) {
      onToggleNavBar();
    }
  };

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
              height: 64,
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
            onClick={() => {
              navigate(drawerHeaderPath);
              if (isMobile && isNavBarOpen) {
                onToggleNavBar();
              }
            }}
          >
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                background: "linear-gradient(90deg, #2196f3 0%, #1e88e5 50%, #1976d2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {drawerHeaderText}
            </Typography>
          </Box>
          <List>
            {navItems.map((item) => {
              if (item.type === "divider") {
                return <Divider key={item.key} variant="middle" component="li" sx={{ my: 1 }} />;
              }
              if (item.type === "header") {
                return (
                  <ListItem key={item.key} disablePadding>
                    <Box sx={{ px: 2, py: 1, width: "100%" }}>
                      <Typography variant="overline" sx={{ fontWeight: 600, color: "text.secondary" }}>
                        {item.label}
                      </Typography>
                    </Box>
                  </ListItem>
                );
              }
              return (
                <ListItem key={item.key} disablePadding>
                  <ListItemButton
                    onClick={() => handleNavItemClick(item.path)}
                    selected={item.isSelected(window.location.pathname)}
                    sx={item.indent ? { pl: 4 } : {}}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          <Box sx={{ marginTop: "auto" }}>
            <List>
              {footerNavItems.map((item) => (
                <ListItem key={item.key} disablePadding>
                  <ListItemButton
                    onClick={() => handleNavItemClick(item.path)}
                    selected={item.isSelected(window.location.pathname)}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                </ListItem>
              ))}
              {footerNavItems.length > 0 && <Divider variant="middle" component="li" sx={{ my: 1 }} />}
              {showProfile && (
                <ProfileListItem profile={profile}
                  isSelected={location.pathname.endsWith("/internal/profile")}
                  onNavigate={() => {
                    if (isMobile && isNavBarOpen) {
                      onToggleNavBar();
                    }
                    navigate("/internal/profile");
                  }} />
              )}
              {showProfile && showPoints && <Divider variant="middle" component="li" sx={{ my: 1 }} />}
              {showPoints && (
                <PointsListItem profile={profile}
                  isSelected={location.pathname.endsWith("/internal/shop")}
                  onNavigate={() => {
                    if (isMobile && isNavBarOpen) {
                      onToggleNavBar();
                    }
                    navigate("/internal/shop");
                  }} />
              )}
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
            aria-label="toggle drawer"
            onClick={onToggleNavBar}
            edge="start"
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          {(showMessages || showNotifications) && (
            <Box sx={{ display: "flex", alignItems: "center" }}>
              {showMessages && (
                <IconButton sx={{ width: 50, height: 50 }} onClick={() => navigate(messagesPath)}>
                  <Badge badgeContent={profile?.unread_messages ? 1 : 0} color="error" variant="dot">
                    <MailIcon />
                  </Badge>
                </IconButton>
              )}
              {showNotifications && (
                <IconButton sx={{ width: 50, height: 50, p: 0 }} onClick={handleNotificationClick}>
                  <Badge badgeContent={profile?.unread_notifications ? 1 : 0} color="error" variant="dot">
                    <NotificationsIcon />
                  </Badge>
                </IconButton>
              )}
            </Box>
          )}
          {children}
        </Toolbar>
      </AppBar>

      {/* Notifications Menu */}
      {showNotifications && (
        <>
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
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: "100%",
          ml: 0,
          minHeight: "100vh",
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

