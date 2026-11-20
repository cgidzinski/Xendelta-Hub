import { getNotificationIcon } from "../notifications/notificationIcon";
import { brandGradient } from "../../theme";
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
  useMediaQuery,
  useTheme,
  Tooltip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import CommandPalette from "../search/CommandPalette";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import NotificationsIcon from "@mui/icons-material/Notifications";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { formatDistance } from "date-fns";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import ProfileListItem from "../ProfileListItem";
import GemBalance from "../GemBalance";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import { useChatUnread } from "../../hooks/chat/useChat";
import { useUserNotifications, Notification } from "../../hooks/user/useUserNotifications";
import { useNavBarSocket } from "../../hooks/useNavBarSocket";
import NotificationModal from "../notifications/NotificationModal";
import LoadingSpinner from "../LoadingSpinner";
import { BRAND_NAME } from "@shared/brand";
import { clickableRowProps } from "../../utils/keyboard";
import { rememberRecentApp } from "../../utils/recentApps";

const DRAWER_WIDTH = 240;

export interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  isSelected: (pathname: string) => boolean;
  type?: "item" | "divider" | "header" | "nested";
  indent?: boolean;
  headerAction?: React.ReactNode;
  endAction?: React.ReactNode;
}

interface BaseNavBarProps {
  title: string;
  isNavBarOpen: boolean;
  onToggleNavBar: () => void;
  navItems: NavItem[];
  scrollableNavItems?: NavItem[];
  footerNavItems?: NavItem[];
  showNotifications?: boolean;
  showMessages?: boolean;
  messagesPath?: string;
  drawerHeaderPath?: string;
  drawerHeaderText?: string;
  showProfile?: boolean;
  showGems?: boolean;
  children?: React.ReactNode;
}

export default function BaseNavBar({
  title,
  isNavBarOpen,
  onToggleNavBar,
  navItems,
  scrollableNavItems = [],
  footerNavItems = [],
  showNotifications = false,
  showMessages = false,
  messagesPath = "/internal/chat",
  drawerHeaderPath = "/internal",
  drawerHeaderText = BRAND_NAME,
  showProfile = true,
  showGems = true,
  children,
}: BaseNavBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => rememberRecentApp(pathname), [pathname]);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { profile } = useUserProfile();
  const { count: unreadChats } = useChatUnread();

  // Ctrl/Cmd+K opens the search palette from anywhere in the app.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const {
    notifications,
    markNotificationAsRead,
    markAllAsRead,
    isMarkingAsRead,
    clearAllNotifications,
    isClearing,
    fetchNotifications,
    isFetching,
  } = useUserNotifications();
  const markedNotificationsRef = useRef<Set<string>>(new Set());

  useNavBarSocket({
    onNewNotification: () => {
      if (notificationAnchorEl) {
        fetchNotifications();
      }
    },
  });

  const renderNavItem = (item: NavItem) => {
    if (item.type === "divider") {
      return <Divider key={item.key} variant="middle" component="li" sx={{ my: 1 }} />;
    }
    if (item.type === "header") {
      return (
        <ListItem key={item.key} disablePadding>
          <Box
            sx={{ px: 2, py: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {item.icon}
              <Typography variant="overline" sx={{ fontWeight: 600, color: "text.secondary" }}>
                {item.label}
              </Typography>
            </Box>
            {item.headerAction}
          </Box>
        </ListItem>
      );
    }
    return (
      <ListItem key={item.key} disablePadding secondaryAction={item.endAction}>
        <ListItemButton
          onClick={() => handleNavItemClick(item.path)}
          selected={item.isSelected(pathname)}
          sx={item.indent ? { pl: 4 } : {}}
        >
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} />
        </ListItemButton>
      </ListItem>
    );
  };

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
    handleNotificationClose();
    if (notification.link) {
      navigate(notification.link);
    } else {
      setSelectedNotification(notification);
      setNotificationModalOpen(true);
    }
  };

  const handleCloseNotificationModal = () => {
    setNotificationModalOpen(false);
    setSelectedNotification(null);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Drawer
        sx={{
          width: isNavBarOpen && !isMobile ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            top: 0,
          },
        }}
        variant={isMobile ? "temporary" : "persistent"}
        anchor="left"
        open={isNavBarOpen}
        onClose={onToggleNavBar}
      >
        <Box sx={{ overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
          <Box
            sx={{
              height: 64,
              flexShrink: 0,
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
            {...clickableRowProps(() => {
              navigate(drawerHeaderPath);
              if (isMobile && isNavBarOpen) {
                onToggleNavBar();
              }
            })}
          >
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                background: brandGradient(theme),
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {drawerHeaderText}
            </Typography>
          </Box>

          {(showGems || showProfile) && (
            <Box sx={{ flexShrink: 0 }}>
              <List sx={{ py: 0 }}>
                {showProfile && (
                  <ProfileListItem
                    profile={profile}
                    isSelected={location.pathname.startsWith("/internal/settings")}
                    onNavigate={() => {
                      if (isMobile && isNavBarOpen) {
                        onToggleNavBar();
                      }
                      navigate("/internal/settings/account");
                    }}
                  />
                )}
                {showGems && (
                  <GemBalance
                    gems={profile?.gems}
                    onNavigate={() => {
                      if (isMobile && isNavBarOpen) {
                        onToggleNavBar();
                      }
                      navigate("/internal/shop");
                    }}
                  />
                )}
              </List>
              <Divider variant="middle" sx={{ my: 1 }} />
            </Box>
          )}

          <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <List>{navItems.map(renderNavItem)}</List>

            {scrollableNavItems.length > 0 && <List sx={{ py: 0 }}>{scrollableNavItems.map(renderNavItem)}</List>}
          </Box>

          {footerNavItems.length > 0 && (
            <Box sx={{ flexShrink: 0, marginTop: "auto" }}>
              <Divider variant="middle" component="li" sx={{ my: 1 }} />
              <List>
                {footerNavItems.map((item) => (
                  <ListItem key={item.key} disablePadding>
                    <ListItemButton onClick={() => handleNavItemClick(item.path)} selected={item.isSelected(pathname)}>
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      <ListItemText primary={item.label} />
                      {item.endAction}
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Box>
      </Drawer>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          width: isNavBarOpen && !isMobile ? `calc(100% - ${DRAWER_WIDTH}px)` : "100%",
          ml: isNavBarOpen && !isMobile ? `${DRAWER_WIDTH}px` : 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          transition: (theme) =>
            theme.transitions.create(["width", "margin-left"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
        }}
      >
        <Toolbar>
          <IconButton color="inherit" aria-label="toggle drawer" onClick={onToggleNavBar} edge="start" sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          {(showMessages || showNotifications) && (
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <IconButton
                color="inherit"
                aria-label="Search (Ctrl+K)"
                title="Search (Ctrl+K)"
                sx={{ width: 50, height: 50 }}
                onClick={() => setPaletteOpen(true)}
              >
                <SearchIcon />
              </IconButton>
              {showMessages && (
                <IconButton
                  color="inherit"
                  aria-label="Chat"
                  sx={{ width: 50, height: 50 }}
                  onClick={() => navigate(messagesPath)}
                >
                  <Badge badgeContent={unreadChats} color="error" max={99}>
                    <ChatBubbleOutlineIcon />
                  </Badge>
                </IconButton>
              )}
              {showNotifications && (
                <IconButton
                  color="inherit"
                  aria-label="Notifications"
                  sx={{ width: 50, height: 50, p: 0 }}
                  onClick={handleNotificationClick}
                >
                  <Badge badgeContent={profile?.unread_notification_count ?? 0} color="error" max={99}>
                    <NotificationsIcon />
                  </Badge>
                </IconButton>
              )}
            </Box>
          )}
          {children}
        </Toolbar>
      </AppBar>

      {(showMessages || showNotifications) && (
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      )}

      {/* Notifications Dropdown */}
      {showNotifications && (
        <Menu
          open={Boolean(notificationAnchorEl)}
          anchorEl={notificationAnchorEl}
          onClose={handleNotificationClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: { sx: { width: 360, maxHeight: `50vh`, mt: 1 } },
          }}
        >
          <Box sx={{ pt: 1 }}>
            <Box sx={{ px: 2, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="overline" sx={{ fontWeight: "bold", lineHeight: 1 }}>
                Notifications
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Tooltip title="Mark all as read">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => markAllAsRead()}
                      disabled={isMarkingAsRead || !notifications?.some((n) => n.unread)}
                      aria-label="Mark all as read"
                    >
                      <DoneAllIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Clear all">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => clearAllNotifications()}
                      disabled={isClearing || !notifications?.length}
                      aria-label="Clear all notifications"
                      sx={{ "&:not(:disabled):hover": { color: "error.main" } }}
                    >
                      <DeleteSweepIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
            <Divider />

            {isFetching && (!notifications || notifications.length === 0) && (
              <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
                <LoadingSpinner />
              </Box>
            )}

            {!isFetching && (!notifications || notifications.length === 0) && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
                No notifications
              </Typography>
            )}

            {notifications?.map((notification, index) => (
              <Box key={notification._id}>
                <ListItem
                  onMouseEnter={() => handleNotificationHover(notification)}
                  onClick={() => handleNotificationItemClick(notification)}
                  sx={{
                    flexDirection: "column",
                    alignItems: "flex-start",
                    py: 1.5,
                    px: 2,
                    cursor: "pointer",
                    backgroundColor: notification.unread ? "action.hover" : "background.default",
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
                    {notification.unread && (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: "primary.main",
                          flexShrink: 0,
                          ml: 1,
                        }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      ml: 4,
                      mb: 0.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 300,
                    }}
                  >
                    {notification.message}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                    {formatDistance(new Date(notification.time), new Date(), { addSuffix: true })}
                  </Typography>
                </ListItem>
                {index < (notifications?.length || 0) - 1 && <Divider variant="fullWidth" />}
              </Box>
            ))}

            <Divider />
            <Box sx={{ p: 1.5, textAlign: "center" }}>
              <Typography
                variant="body2"
                color="primary"
                sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                onClick={() => {
                  navigate("/internal/notifications");
                  handleNotificationClose();
                }}
              >
                View all notifications
              </Typography>
            </Box>
          </Box>
        </Menu>
      )}

      {/* Notification Detail Modal */}
      <NotificationModal
        notification={selectedNotification}
        open={notificationModalOpen}
        onClose={handleCloseNotificationModal}
      />

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
