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
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CssBaseline from "@mui/material/CssBaseline";
import { useNavigate } from "react-router-dom";
import ProfileListItem from "./ProfileListItem";

const DRAWER_WIDTH = 240;

export interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  isSelected: (pathname: string) => boolean;
}

interface BaseNavBarProps {
  title: string;
  isNavBarOpen: boolean;
  onToggleNavBar: () => void;
  navItems: NavItem[];
  footerNavItems?: NavItem[];
  showNotifications?: boolean;
  showMessages?: boolean;
  onNotificationClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onMessagesClick?: () => void;
  unreadMessages?: boolean;
  unreadNotifications?: boolean;
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
  onNotificationClick,
  onMessagesClick,
  unreadMessages = false,
  unreadNotifications = false,
  children,
}: BaseNavBarProps) {
  const navigate = useNavigate();

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
            onClick={() => navigate("/internal")}
          >
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                background: "linear-gradient(90deg, #b000b0 0%, #c000c0 50%, #d000d0 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              XenDelta
            </Typography>
          </Box>
          <List>
            {navItems.map((item) => (
              <ListItem key={item.key} disablePadding>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  selected={item.isSelected(window.location.pathname)}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Box sx={{ marginTop: "auto" }}>
            <List>
              {footerNavItems.map((item) => (
                <ListItem key={item.key} disablePadding>
                  <ListItemButton
                    onClick={() => navigate(item.path)}
                    selected={item.isSelected(window.location.pathname)}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                </ListItem>
              ))}
              {footerNavItems.length > 0 && <Divider variant="middle" component="li" sx={{ my: 1 }} />}
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
          {children}
        </Toolbar>
      </AppBar>

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

