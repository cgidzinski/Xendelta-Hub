import React, { useEffect, useState } from "react";
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  Login as LoginIcon,
  PersonAdd,
  TrendingUp,
  Security,
  Speed,
  Group,
  ArrowForward,
  CheckCircle,
} from "@mui/icons-material";
import LandingHeader from "../../../components/LandingHeader";

export default function Landing() {
  const navigate = useNavigate();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const stats = [
    { value: "10K+", label: "Active Users", icon: <Group /> },
    { value: "99.9%", label: "Uptime", icon: <Speed /> },
    { value: "256-bit", label: "Encryption", icon: <Security /> },
    { value: "24/7", label: "Support", icon: <TrendingUp /> },
  ];

  const highlights = [
    "Real-time messaging with end-to-end encryption",
    "Advanced notification system with smart filtering",
    "Enterprise-grade security and compliance",
    "Lightning-fast performance with global CDN",
    "Seamless team collaboration tools",
    "Cloud-powered with automatic synchronization",
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.default",
        position: "relative",
        overflow: "hidden",
      }}
    >
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

      <LandingHeader />

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
              The next-generation platform for seamless communication, collaboration, and productivity.
              Built for teams that demand excellence and innovation.
            </Typography>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="center"
              sx={{ mb: 6 }}
            >
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
          </Box>
        </Container>
      </Box>

      {/* Stats Section */}
      <Box
        sx={{
          py: { xs: 6, md: 8 },
          position: "relative",
          backgroundColor: "background.paper",
          borderTop: "1px solid",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} justifyContent="center">
            {stats.map((stat, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Card
                  elevation={0}
                  sx={{
                    textAlign: "center",
                    p: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                    backgroundColor: "transparent",
                    transition: "all 0.3s ease",
                    "&:hover": {
                      transform: "translateY(-8px)",
                      borderColor: "primary.main",
                      boxShadow: "0 12px 32px rgba(0, 245, 255, 0.2)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      color: "primary.main",
                      mb: 2,
                      display: "flex",
                      justifyContent: "center",
                      "& svg": { fontSize: 40 },
                    }}
                  >
                    {stat.icon}
                  </Box>
                  <Typography
                    variant="h3"
                    sx={{
                      fontWeight: 700,
                      mb: 1,
                      background: "linear-gradient(135deg, #00f5ff 0%, #00a8ff 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {stat.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {stat.label}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Highlights Section */}
      <Box sx={{ py: { xs: 8, md: 12 }, position: "relative" }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 6 }}>
            <Typography
              variant="h3"
              component="h2"
              sx={{
                fontWeight: 700,
                mb: 2,
                background: "linear-gradient(135deg, #00f5ff 0%, #00d4ff 50%, #00a8ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Why Choose Xendelta Hub?
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: "auto" }}>
              Experience the difference with our cutting-edge features
            </Typography>
          </Box>

          <Grid container spacing={3} sx={{ mb: 6 }} justifyContent="center">
            {highlights.map((highlight, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    p: 3,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    transition: "all 0.3s ease",
                    "&:hover": {
                      borderColor: "primary.main",
                      backgroundColor: "rgba(0, 245, 255, 0.05)",
                      transform: "translateX(8px)",
                    },
                  }}
                >
                  <CheckCircle
                    sx={{
                      color: "primary.main",
                      mr: 2,
                      mt: 0.5,
                      fontSize: 28,
                    }}
                  />
                  <Typography variant="body1" sx={{ flex: 1, fontWeight: 500 }}>
                    {highlight}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          position: "relative",
          backgroundColor: "background.paper",
          borderTop: "1px solid",
          borderBottom: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background: "linear-gradient(90deg, transparent, #00f5ff, #ff00ff, transparent)",
            animation: "shimmer 3s ease-in-out infinite",
            "@keyframes shimmer": {
              "0%, 100%": { opacity: 0.5 },
              "50%": { opacity: 1 },
            },
          },
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ textAlign: "center", position: "relative", zIndex: 1 }}>
            <Typography
              variant="h3"
              component="h2"
              sx={{
                fontWeight: 700,
                mb: 2,
                background: "linear-gradient(135deg, #00f5ff 0%, #ff00ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Ready to Transform Your Workflow?
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: "text.secondary",
                mb: 4,
                fontWeight: 400,
              }}
            >
              Join thousands of teams already using Xendelta Hub to revolutionize their collaboration
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center">
              <Button
                variant="contained"
                size="large"
                startIcon={<PersonAdd />}
                onClick={() => navigate("/signup")}
                endIcon={<ArrowForward />}
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
                  "&:hover": {
                    backgroundColor: "primary.dark",
                    boxShadow: "0 12px 40px rgba(0, 245, 255, 0.6)",
                    transform: "translateY(-3px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Create Your Account
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => navigate("/features")}
                sx={{
                  px: 5,
                  py: 1.75,
                  fontSize: "1rem",
                  fontWeight: 600,
                  borderColor: "primary.main",
                  borderWidth: 2,
                  color: "primary.main",
                  textTransform: "none",
                  borderRadius: 3,
                  "&:hover": {
                    borderColor: "primary.light",
                    backgroundColor: "rgba(0, 245, 255, 0.1)",
                    borderWidth: 2,
                    transform: "translateY(-3px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Explore Features
              </Button>
            </Stack>
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          borderTop: "1px solid",
          borderColor: "divider",
          py: 4,
          mt: "auto",
          position: "relative",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              © {new Date().getFullYear()} Xendelta Hub. All rights reserved.
            </Typography>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
