import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { TrendingUp, Security, Speed, Group } from "@mui/icons-material";
import LandingHeader from "../../../components/LandingHeader";
import HeroSection from "./components/HeroSection";
import StatsSection from "./components/StatsSection";
import HighlightsSection from "./components/HighlightsSection";
import CTASection from "./components/CTASection";
import Footer from "./components/Footer";

export default function Landing() {
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
      <LandingHeader />
      <HeroSection mousePosition={mousePosition} />
      <StatsSection stats={stats} />
      <HighlightsSection highlights={highlights} />
      <CTASection />
      <Footer />
    </Box>
  );
}
