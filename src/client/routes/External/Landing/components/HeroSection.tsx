import { Box, Container, Typography, Button, Stack, Chip } from "@mui/material";
import { Login as LoginIcon, PersonAdd, ArrowForward } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

interface HeroSectionProps {
  mousePosition: { x: number; y: number };
}

export default function HeroSection({ mousePosition }: HeroSectionProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Animated background gradient */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(0, 245, 255, 0.1) 0%, transparent 50%)`,
          pointerEvents: "none",
          zIndex: 0,
          transition: "background 0.3s ease-out",
        }}
      />

      {/* Hero Section */}
      <Box
        sx={{
          position: "relative",
          py: { xs: 8, md: 16 },
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: "-50%",
            left: "-50%",
            width: "200%",
            height: "200%",
            background: "radial-gradient(circle, rgba(0, 245, 255, 0.05) 0%, transparent 70%)",
            animation: "pulse 20s ease-in-out infinite",
            "@keyframes pulse": {
              "0%, 100%": { transform: "scale(1) rotate(0deg)" },
              "50%": { transform: "scale(1.1) rotate(180deg)" },
            },
          },
        }}
      >
        <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
          <Box sx={{ textAlign: "center", maxWidth: 900, mx: "auto" }}>
            <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
              <Chip
                label="New: Enhanced Security Features"
                sx={{
                  backgroundColor: "primary.main",
                  color: "white",
                  fontWeight: 600,
                  px: 1,
                  animation: "fadeInDown 0.6s ease-out",
                  "@keyframes fadeInDown": {
                    from: { opacity: 0, transform: "translateY(-20px)" },
                    to: { opacity: 1, transform: "translateY(0)" },
                  },
                }}
              />
            </Box>
            <Typography
              variant="h1"
              component="h1"
              sx={{
                fontWeight: 800,
                mb: 3,
                fontSize: { xs: "2.5rem", sm: "3.5rem", md: "4.5rem" },
                lineHeight: 1.1,
                background: "linear-gradient(135deg, #00f5ff 0%, #00d4ff 30%, #00a8ff 60%, #ff00ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                backgroundSize: "200% auto",
                animation: "gradientShift 5s ease infinite",
                "@keyframes gradientShift": {
                  "0%, 100%": { backgroundPosition: "0% center" },
                  "50%": { backgroundPosition: "100% center" },
                },
              }}
            >
              Welcome to Xendelta Hub
            </Typography>
            <Typography
              variant="h5"
              sx={{
                color: "text.secondary",
                mb: 5,
                fontWeight: 400,
                lineHeight: 1.7,
                fontSize: { xs: "1.1rem", md: "1.5rem" },
                maxWidth: 700,
                mx: "auto",
              }}
            >
              A collection of services, tools and projects that i've built to help me and others be more productive.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center" sx={{ mb: 2 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<LoginIcon />}
                onClick={() => navigate("/login")}
                sx={{
                  px: 5,
                  py: 1.75,
                  fontSize: "1rem",
                  fontWeight: 600,
                  backgroundColor: "primary.main",
                  color: "white",
                  textTransform: "none",
                  borderRadius: 3,
                  boxShadow: "0 8px 32px rgba(0, 245, 255, 0.4)",
                  position: "relative",
                  overflow: "hidden",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: "-100%",
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                    transition: "left 0.5s",
                  },
                  "&:hover": {
                    backgroundColor: "primary.dark",
                    boxShadow: "0 12px 40px rgba(0, 245, 255, 0.6)",
                    transform: "translateY(-3px)",
                    "&::before": {
                      left: "100%",
                    },
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Sign In
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<PersonAdd />}
                onClick={() => navigate("/signup")}
                endIcon={<ArrowForward />}
                sx={{
                  px: 5,
                  py: 1.75,
                  fontSize: "1rem",
                  fontWeight: 600,
                  borderColor: "secondary.main",
                  borderWidth: 2,
                  color: "secondary.main",
                  textTransform: "none",
                  borderRadius: 3,
                  boxShadow: "0 8px 32px rgba(255, 0, 255, 0.3)",
                  "&:hover": {
                    borderColor: "secondary.light",
                    backgroundColor: "rgba(255, 0, 255, 0.1)",
                    borderWidth: 2,
                    boxShadow: "0 12px 40px rgba(255, 0, 255, 0.5)",
                    transform: "translateY(-3px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Get Started
              </Button>
            </Stack>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                opacity: 0.85,
                textAlign: "center",
                fontStyle: "italic",
                mb: 3,
                mt: 3,
                fontSize: { xs: "0.95rem", md: "1rem" },
                fontWeight: 400,
              }}
            >
              Note: Some information is fictional and for demonstration purposes only. Some apps may not be available
              yet.
            </Typography>
          </Box>
        </Container>
      </Box>
    </>
  );
}
