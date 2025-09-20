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
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import { useNavBar } from "../contexts/NavBarContext";
import CssBaseline from "@mui/material/CssBaseline";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import NotificationsIcon from "@mui/icons-material/Notifications";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import InboxIcon from "@mui/icons-material/MoveToInbox";
import MailIcon from "@mui/icons-material/Mail";
const DRAWER_WIDTH = 240;
import { useAuth } from "../contexts/AuthContext";
export default function Root() {
  let location = useLocation();
  const navigate = useNavigate();
  const { isNavBarOpen, setNavBar, toggleNavBar, title } = useNavBar();
  const { user } = useAuth();

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
                marginRight: 2,
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
            <IconButton sx={{ width: 50, height: 50 }}>
              <Badge badgeContent={4} color="error">
                <MailIcon />
              </Badge>
            </IconButton>
            <IconButton sx={{ width: 50, height: 50 }}>
              <Badge badgeContent={17} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>
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
            {/* Home */}
            <ListItem key={"home"} disablePadding>
              <ListItemButton onClick={() => navigate("/home")} selected={location.pathname.endsWith("/home")}>
                <ListItemIcon>
                  <HomeIcon />
                </ListItemIcon>
                <ListItemText primary={"Home"} />
              </ListItemButton>
            </ListItem>
            {/*  */}
            <Divider />
            {/* {["All mail", "Trash", "Spam"].map((text, index) => (
              <ListItem key={text} disablePadding>
                <ListItemButton>
                  <ListItemIcon>{index % 2 === 0 ? <InboxIcon /> : <MailIcon />}</ListItemIcon>
                  <ListItemText primary={text} />
                </ListItemButton>
              </ListItem>
            ))} */}
          </List>

          <Box sx={{ marginTop: "auto" }}>
            <List>
              <ListItem key={"settings"} disablePadding>
                <ListItemButton
                  onClick={() => navigate("/settings")}
                  selected={location.pathname.endsWith("/settings")}
                >
                  <ListItemIcon>
                    <LogoutIcon />
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
                    <Avatar src={user.avatar} />
                  </ListItemAvatar>
                  <ListItemText primary={user.username} secondary={user.email} />
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
