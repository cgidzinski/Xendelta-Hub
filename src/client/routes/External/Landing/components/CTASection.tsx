import { Box, Container, Typography, Button, Stack } from "@mui/material";
import { PersonAdd, ArrowForward } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

export default function CTASection() {
  const navigate = useNavigate();

  return (
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
            Join thousands of teams who aren't using Xendelta Hub to revolutionize their collaboration
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
  );
}

