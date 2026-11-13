import { Box, Button, Container, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { ctaButtonSx } from "../../../../components/ui/marketingStyles";

export default function CTASection() {
  const navigate = useNavigate();
  return (
    <Box sx={{ py: { xs: 6, md: 9 }, borderTop: 1, borderColor: "divider" }}>
      <Container maxWidth="sm" sx={{ textAlign: "center" }}>
        <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Ready when you are.
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Make an account, pin the apps you want, and invite the people you'd share them with.
        </Typography>
        <Button variant="contained" size="large" onClick={() => navigate("/signup")} sx={ctaButtonSx}>
          Create an account
        </Button>
      </Container>
    </Box>
  );
}
