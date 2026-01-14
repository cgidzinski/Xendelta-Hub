import {
  Box,
  Typography,
  Button,
} from "@mui/material";
import { Login as LoginIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

export default function LandingHeader() {
  const navigate = useNavigate();

  return (
    <>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          borderBottom: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(10px)",
          backgroundColor: "rgba(18, 18, 18, 0.8)",
        }}
      >
        <Box
          sx={{
            maxWidth: "1200px",
            mx: "auto",
            px: { xs: 2, sm: 3, md: 4 },
            py: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: { xs: 1, md: 2 },
            flexWrap: { xs: "wrap", md: "nowrap" },
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
              flexShrink: 0,
            }}
          >
            XenDelta Hub
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: { xs: 1, sm: 2, md: 4 },
              alignItems: "center",
              flex: { xs: "1 1 100%", md: "0 0 auto" },
              justifyContent: { xs: "center", md: "flex-start" },
              order: { xs: 3, md: 2 },
              width: { xs: "100%", md: "auto" },
              mt: { xs: 1, md: 0 },
            }}
          >
            <Button
              color="inherit"
              onClick={() => navigate("/blog")}
              sx={{
                color: "text.secondary",
                textTransform: "none",
                fontWeight: 500,
                fontSize: { xs: "0.875rem", md: "1rem" },
                px: { xs: 1.5, md: 2 },
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
                fontSize: { xs: "0.875rem", md: "1rem" },
                px: { xs: 1.5, md: 2 },
                "&:hover": {
                  color: "primary.main",
                },
              }}
            >
              Features
            </Button>
          </Box>
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={() => navigate("/login")}
            sx={{
              px: { xs: 2, md: 3 },
              py: 1,
              fontWeight: 600,
              fontSize: { xs: "0.875rem", md: "1rem" },
              backgroundColor: "primary.main",
              boxShadow: "0 0 20px rgba(33, 150, 243, 0.3)",
              flexShrink: 0,
              order: { xs: 2, md: 3 },
              "&:hover": {
                backgroundColor: "primary.dark",
                boxShadow: "0 0 30px rgba(33, 150, 243, 0.5)",
              },
            }}
          >
            Sign In
          </Button>
        </Box>
      </Box>
    </>
  );
}

