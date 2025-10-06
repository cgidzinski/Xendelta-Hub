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
const DRAWER_WIDTH = 240;
import { useUserProfile } from "../hooks/user/useUserProfile";
import { useState, useRef } from "react";
import { useUserNotifications, Notification } from "../hooks/user/useUserNotifications";
import LoadingSpinner from "./LoadingSpinner";
import { formatDistance } from "date-fns";
export default function Root() {
  let location = useLocation();
  const navigate = useNavigate();
  const { isNavBarOpen, setNavBar, toggleNavBar, title } = useNavBar();
  const { profile } = useUserProfile();
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);
  const { notifications, markNotificationAsRead, fetchNotifications, isFetching } = useUserNotifications();
  const markedNotificationsRef = useRef<Set<string>>(new Set());

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

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={toggleNavBar}
            edge="start"
            sx={[
              {
                mr: 2,
              },
              // isNavBarOpen && { display: 'none' },
            ]}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }} onClick={() => setNavBar(true)}>
            {title}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <IconButton sx={{ width: 50, height: 50 }} onClick={() => navigate("/messages")}>
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
                    sx={{
                      backgroundColor: notification.unread ? "transparent" : "background.default",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      py: 1,
                      px: 2,
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

      <Drawer
        sx={{
          width: isNavBarOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
        variant="persistent"
        anchor="left"
        open={isNavBarOpen}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto", display: "flex", flexDirection: "column", height: "100%" }}>
          <List>
            <ListItem key={"home"} disablePadding>
              <ListItemButton onClick={() => navigate("/home")} selected={location.pathname.endsWith("/home")}>
                <ListItemIcon>
                  <HomeIcon />
                </ListItemIcon>
                <ListItemText primary={"Home"} />
              </ListItemButton>
            </ListItem>
            {/* Messages */}
            <ListItem key={"messages"} disablePadding>
              <ListItemButton onClick={() => navigate("/messages")} selected={location.pathname.endsWith("/messages")}>
                <ListItemIcon>
                  <MailIcon />
                </ListItemIcon>
                <ListItemText primary={"Messages"} />
              </ListItemButton>
            </ListItem>
          </List>

          <Box sx={{ marginTop: "auto" }}>
            <List>
              <ListItem key={"settings"} disablePadding>
                <ListItemButton
                  onClick={() => navigate("/settings")}
                  selected={location.pathname.endsWith("/settings")}
                >
                  <ListItemIcon>
                    <SettingsIcon />
                  </ListItemIcon>
                  <ListItemText primary={"Settings"} />
                </ListItemButton>
              </ListItem>
              <Divider variant="middle" component="li" sx={{ my: 1 }} />
              <ListItem disablePadding>
                <ListItemButton
                  sx={{ pl: 1 }}
                  disableGutters
                  onClick={() => navigate("/profile")}
                  selected={location.pathname.endsWith("/profile")}
                >
                  <ListItemAvatar>
                    <Avatar src={profile?.avatar} />
                  </ListItemAvatar>
                  <ListItemText primary={profile?.username} secondary={profile?.email} />
                </ListItemButton>
              </ListItem>
            </List>
          </Box>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
