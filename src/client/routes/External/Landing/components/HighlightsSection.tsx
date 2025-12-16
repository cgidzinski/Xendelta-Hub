import { Box, Container, Grid, Typography } from "@mui/material";
import CheckCircle from "@mui/icons-material/CheckCircle";

interface HighlightsSectionProps {
  highlights: string[];
}

export default function HighlightsSection({ highlights }: HighlightsSectionProps) {
  return (
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
            <Grid size={{ xs: 12, sm: 6 }} key={index}>
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
  );
}

