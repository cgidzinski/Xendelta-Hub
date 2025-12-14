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
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import SecurityIcon from "@mui/icons-material/Security";
import MenuIcon from "@mui/icons-material/Menu";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import PeopleIcon from "@mui/icons-material/People";
import ArticleIcon from "@mui/icons-material/Article";
import CssBaseline from "@mui/material/CssBaseline";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import ProfileListItem from "./ProfileListItem";
import { Divider } from "@mui/material";
import { useNavBar } from "../contexts/NavBarContext";
import { useSocket } from "../hooks/useSocket";
import { useUserProfile } from "../hooks/user/useUserProfile";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { Conversation } from "../hooks/user/useUserMessages";

const DRAWER_WIDTH = 240;

export default function AdminNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isNavBarOpen, setIsNavBarOpen] = useState(true);
  const { title } = useNavBar();
  const { socket } = useSocket();
  const { refetch: refetchProfile } = useUserProfile();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // Set up socket listeners for system message notifications
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { conversationId: string; message: any }) => {
      // Check if this is a system message - backend sends senderUsername: "System" for system messages
      const isSystemMessage = data.message.senderUsername === "System" || data.message.isSystemMessage || data.message.from === "system";
      
      // Force refetch conversations list when new message arrives
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();
      
      // Show notification for system messages
      if (isSystemMessage) {
        const messagePreview = data.message.message?.substring(0, 50) || "New system message";
        enqueueSnackbar(`System message: ${messagePreview}${data.message.message?.length > 50 ? '...' : ''}`, {
          variant: "info",
          autoHideDuration: 5000,
        });
      }
    };

    const handleNewConversation = (data: { conversation: Conversation }) => {
      // Check if this is a system conversation
      const isSystemConversation = data.conversation.participants?.includes("system") || data.conversation.name === "System Messages";
      
      // Force refetch conversations list when new conversation is created
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();
      
      // Show notification for system conversations
      if (isSystemConversation) {
        enqueueSnackbar("You have received a new system message", {
          variant: "info",
          autoHideDuration: 5000,
        });
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("conversation:new", handleNewConversation);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:new", handleNewConversation);
    };
  }, [socket, queryClient, refetchProfile, enqueueSnackbar]);

  const toggleNavBar = () => {
    setIsNavBarOpen(!isNavBarOpen);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
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
            sx={{ mr: 2 }}
          >
            {isNavBarOpen ? <MenuIcon /> : <MenuIcon />}
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {title || "General"}
          </Typography>
        </Toolbar>
      </AppBar>

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
            <ListItem key={"admin"} disablePadding>
              <ListItemButton onClick={() => navigate("/admin")} selected={location.pathname === "/admin"}>
                <ListItemIcon>
                  <SecurityIcon />
                </ListItemIcon>
                <ListItemText primary={"General"} />
              </ListItemButton>
            </ListItem>
            <ListItem key={"users"} disablePadding>
              <ListItemButton onClick={() => navigate("/admin/users")} selected={location.pathname === "/admin/users"}>
                <ListItemIcon>
                  <PeopleIcon />
                </ListItemIcon>
                <ListItemText primary={"Users"} />
              </ListItemButton>
            </ListItem>
            <ListItem key={"blog"} disablePadding>
              <ListItemButton onClick={() => navigate("/admin/blog")} selected={location.pathname.startsWith("/admin/blog")}>
                <ListItemIcon>
                  <ArticleIcon />
                </ListItemIcon>
                <ListItemText primary={"Blog Management"} />
              </ListItemButton>
            </ListItem>
          </List>

          <Box sx={{ marginTop: "auto" }}>
            <List>
              <ListItem key={"home"} disablePadding>
                <ListItemButton onClick={() => navigate("/internal")}>
                  <ListItemIcon>
                    <HomeIcon />
                  </ListItemIcon>
                  <ListItemText primary={"Back to Home"} />
                </ListItemButton>
              </ListItem>
              <Divider variant="middle" component="li" sx={{ my: 1 }} />
              <ProfileListItem />
            </List>
          </Box>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "background.default",
          p: 3,
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

