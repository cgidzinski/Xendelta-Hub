import { Box, Container, Typography, Button, Stack } from "@mui/material";
import { PersonAdd, ArrowForward } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { accentTopLineSx, ctaButtonSx, gradientTextSx } from "../../../../components/ui/marketingStyles";

export default function CTASection() {
  const navigate = useNavigate();
  const theme = useTheme();

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
        ...accentTopLineSx(theme),
      }}
    >
      <Container maxWidth="md">
        <Box sx={{ textAlign: "center" }}>
          <Typography
            variant="h3"
            component="h2"
            sx={{ fontWeight: 700, mb: 2, ...gradientTextSx(theme, "short") }}
          >
            Ready to Transform Your Workflow?
          </Typography>
          <Typography variant="h6" sx={{ color: "text.secondary", mb: 4, fontWeight: 400 }}>
            Join thousands of teams who aren't using Xendelta Hub to revolutionize their collaboration
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center">
            <Button
              variant="contained"
              size="large"
              startIcon={<PersonAdd />}
              endIcon={<ArrowForward />}
              onClick={() => navigate("/signup")}
              sx={ctaButtonSx}
            >
              Create Your Account
            </Button>
            <Button variant="outlined" size="large" onClick={() => navigate("/features")} sx={ctaButtonSx}>
              Explore Features
            </Button>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
