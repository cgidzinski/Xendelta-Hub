import { Box } from "@mui/material";
import { TrendingUp, Security, Speed, Group } from "@mui/icons-material";
import LandingHeader from "../../../components/LandingHeader";
import HeroSection from "./components/HeroSection";
import StatsSection from "./components/StatsSection";
import HighlightsSection from "./components/HighlightsSection";
import CTASection from "./components/CTASection";
import Footer from "./components/Footer";

export default function Landing() {
  const stats = [
    { value: "10K+", label: "Active Fake Users", icon: <Group /> },
    { value: "99.9%", label: "Uptime, sometimes", icon: <Speed /> },
    { value: "256-bit", label: "Encryption, somewhere", icon: <Security /> },
    { value: "24/7", label: "Emotional Support", icon: <TrendingUp /> },
  ];

  const highlights = [
    "XenChat - Real-time messaging with end-to-end encryption",
    "XenBox - File sharing with secure and efficient file sharing system",
    "Recipaint - Miniature painting planner with step by step paint planner",
    "Xensplit - Split expenses with friends, track balances, settle up easily",
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
      <LandingHeader />
      <HeroSection />
      <StatsSection stats={stats} />
      <HighlightsSection highlights={highlights} />
      <CTASection />
      <Footer />
    </Box>
  );
}
