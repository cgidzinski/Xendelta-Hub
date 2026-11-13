import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { BRAND_NAME } from "@shared/brand";
import { ctaButtonSx, gradientTextSx } from "../../../../components/ui/marketingStyles";

export default function HeroSection() {
  const navigate = useNavigate();
  const theme = useTheme();

  return (
    <Box sx={{ py: { xs: 8, md: 14 } }}>
      <Container maxWidth="md" sx={{ textAlign: "center" }}>
        {/* The one gradient on this page. */}
        <Typography
          variant="h1"
          component="h1"
          sx={{
            fontWeight: 800,
            mb: 2,
            fontSize: { xs: "3rem", md: "4.5rem" },
            lineHeight: 1.05,
            ...gradientTextSx(theme, "short"),
          }}
        >
          {BRAND_NAME}
        </Typography>
        <Typography component="p" variant="h4" sx={{ fontWeight: 600, mb: 2, fontSize: { xs: "1.5rem", md: "2rem" } }}>
          Apps for the people around you.
        </Typography>
        <Typography
          color="text.secondary"
          sx={{ maxWidth: 620, mx: "auto", mb: 4, fontSize: { xs: "1rem", md: "1.125rem" } }}
        >
          Split a bill, plan the week's meals, keep a note, share a file. One account for all of it, shared with the
          people you choose.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center">
          <Button variant="contained" size="large" onClick={() => navigate("/signup")} sx={ctaButtonSx}>
            Create an account
          </Button>
          <Button variant="outlined" color="inherit" size="large" onClick={() => navigate("/login")} sx={ctaButtonSx}>
            Sign in
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          No fake user counts, no "revolutionary synergy". Scroll down for what's actually here.
        </Typography>
      </Container>
    </Box>
  );
}
