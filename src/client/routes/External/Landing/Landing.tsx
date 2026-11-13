import { useEffect } from "react";
import { Box, Container, Typography } from "@mui/material";
import { BRAND_NAME } from "@shared/brand";
import LandingHeader from "../../../components/LandingHeader";
import AppShowcase from "../components/AppShowcase";
import PublicFooter from "../components/PublicFooter";
import HeroSection from "./components/HeroSection";
import HowItWorks from "./components/HowItWorks";
import HonestAside from "./components/HonestAside";
import CTASection from "./components/CTASection";

export default function Landing() {
  // Coming back from another public page, the tab says the product's name again.
  useEffect(() => {
    document.title = BRAND_NAME;
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "background.default" }}>
      <LandingHeader />
      <HeroSection />
      <Box id="apps" sx={{ py: { xs: 6, md: 8 }, borderTop: 1, borderColor: "divider" }}>
        <Container maxWidth="lg">
          <Typography variant="overline" color="text.secondary">
            The apps
          </Typography>
          <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 3 }}>
            Each one does one job well.
          </Typography>
          <AppShowcase />
        </Container>
      </Box>
      <HowItWorks />
      <HonestAside />
      <CTASection />
      <PublicFooter />
    </Box>
  );
}
