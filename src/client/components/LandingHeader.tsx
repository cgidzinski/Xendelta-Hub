import React from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
} from "@mui/material";
import { Login as LoginIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

export default function LandingHeader() {
  const navigate = useNavigate();

  return (
    <AppBar position="static" elevation={0} sx={{ backgroundColor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
      <Toolbar sx={{ position: "relative" }}>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center" }}>
          <Typography
            variant="h5"
            component="div"
            onClick={() => navigate("/")}
            sx={{
              fontWeight: 700,
              background: "linear-gradient(90deg, #b000b0 0%, #c000c0 50%, #d000d0 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              cursor: "pointer",
              "&:hover": {
                opacity: 0.8,
              },
              transition: "opacity 0.2s ease",
            }}
          >
            Xendelta Hub
          </Typography>
        </Box>
        <Box sx={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4 }}>
          <Button
            color="inherit"
            onClick={() => navigate("/blog")}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              fontWeight: 500,
              "&:hover": {
                color: "primary.main",
              },
            }}
          >
            Blog
          </Button>
          <Button
            color="inherit"
            onClick={() => navigate("/features")}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              fontWeight: 500,
              "&:hover": {
                color: "primary.main",
              },
            }}
          >
            Features
          </Button>
        </Box>
        <Box sx={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={() => navigate("/login")}
            sx={{
              px: 3,
              py: 1,
              fontWeight: 600,
              backgroundColor: "primary.main",
              boxShadow: "0 0 20px rgba(176, 0, 176, 0.3)",
              "&:hover": {
                backgroundColor: "primary.dark",
                boxShadow: "0 0 30px rgba(176, 0, 176, 0.5)",
              },
            }}
          >
            Sign In
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

