import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
} from "@mui/material";
import { Login as LoginIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";

export default function LandingHeader() {
  const navigate = useNavigate();

  return (
    <AppBar position="static" elevation={0} sx={{ backgroundColor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
      <Toolbar
        sx={{
          position: "relative",
          flexDirection: { xs: "column", sm: "row" },
          py: { xs: 1.5, sm: 1 },
          gap: { xs: 1.5, sm: 0 },
        }}
      >
        {/* Logo - Left side */}
        <Box
          sx={{
            flex: { xs: "0 0 auto", sm: 1 },
            display: "flex",
            alignItems: "center",
            width: { xs: "100%", sm: "auto" },
            justifyContent: { xs: "space-between", sm: "flex-start" },
          }}
        >
          <Typography
            variant="h5"
            component="div"
            onClick={() => navigate("/")}
            sx={{
              fontWeight: 700,
              background: "linear-gradient(90deg, #2196f3 0%, #1e88e5 50%, #1976d2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              cursor: "pointer",
              "&:hover": {
                opacity: 0.8,
              },
              transition: "opacity 0.2s ease",
              fontSize: { xs: "1.25rem", sm: "1.5rem" },
            }}
          >
            Xendelta Hub
          </Typography>
          {/* Mobile: Theme toggle and Sign In button - shown on mobile in top row */}
          <Box sx={{ display: { xs: "flex", sm: "none" }, alignItems: "center", gap: 0.5 }}>
            <ThemeToggle size={40} />
            <Button
              variant="contained"
              startIcon={<LoginIcon />}
              onClick={() => navigate("/login")}
              sx={{
                px: 2,
                py: 0.75,
                fontWeight: 600,
                backgroundColor: "primary.main",
                boxShadow: "0 0 20px rgba(33, 150, 243, 0.3)",
                "&:hover": {
                  backgroundColor: "primary.dark",
                  boxShadow: "0 0 30px rgba(33, 150, 243, 0.5)",
                },
                fontSize: "0.875rem",
              }}
            >
              Sign In
            </Button>
          </Box>
        </Box>

        {/* Mobile: Blog and Features buttons (bottom row) */}
        <Box
          sx={{
            width: "100%",
            display: { xs: "flex", sm: "none" },
            justifyContent: "center",
            gap: 3,
            pt: 0.5,
          }}
        >
          <Button
            color="inherit"
            onClick={() => navigate("/blog")}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              fontWeight: 500,
              minWidth: "auto",
              px: 2,
              py: 1,
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
              minWidth: "auto",
              px: 2,
              py: 1,
              "&:hover": {
                color: "primary.main",
              },
            }}
          >
            Features
          </Button>
        </Box>

        {/* Desktop: Center buttons */}
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: { xs: "none", sm: "flex" },
            gap: 4,
          }}
        >
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

        {/* Desktop: Right side - Theme toggle and Sign In button */}
        <Box
          sx={{
            flex: { xs: 0, sm: 1 },
            display: { xs: "none", sm: "flex" },
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 1,
          }}
        >
          <ThemeToggle size={40} showDivider={true} />
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={() => navigate("/login")}
            sx={{
              px: 3,
              py: 1,
              fontWeight: 600,
              backgroundColor: "primary.main",
              boxShadow: "0 0 20px rgba(33, 150, 243, 0.3)",
              "&:hover": {
                backgroundColor: "primary.dark",
                boxShadow: "0 0 30px rgba(33, 150, 243, 0.5)",
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

