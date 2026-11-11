import { Box, Container, Typography, Button, Stack, Chip } from "@mui/material";
import { Login as LoginIcon, PersonAdd, ArrowForward } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { ctaButtonSx, gradientTextSx } from "../../../../components/ui/marketingStyles";

export default function HeroSection() {
  const navigate = useNavigate();
  const theme = useTheme();

  return (
    <Box sx={{ position: "relative", py: { xs: 8, md: 16 }, overflow: "hidden" }}>
      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
        <Box sx={{ textAlign: "center", maxWidth: 900, mx: "auto" }}>
          <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
            <Chip label="New: Enhanced Security Features" color="primary" sx={{ fontWeight: 600, px: 1 }} />
          </Box>
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontWeight: 800,
              mb: 3,
              fontSize: { xs: "2.5rem", sm: "3.5rem", md: "4.5rem" },
              lineHeight: 1.1,
              ...gradientTextSx(theme),
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
              sx={ctaButtonSx}
            >
              Sign In
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              size="large"
              startIcon={<PersonAdd />}
              endIcon={<ArrowForward />}
              onClick={() => navigate("/signup")}
              sx={ctaButtonSx}
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
              my: 3,
              fontSize: { xs: "0.95rem", md: "1rem" },
            }}
          >
            Note: Some information is fictional and for demonstration purposes only. Some apps may not be available yet.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
