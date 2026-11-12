import type { ReactNode } from "react";
import { Box, Card, CardContent, Container, Grid, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import LandingHeader from "../LandingHeader";
import { NEON } from "../../theme";

interface AuthSplitLayoutProps {
  /** An icon element, shown in the outlined square above the title. */
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  footnote: ReactNode;
  /** Show the welcome panel on phones too. Login hides it to put the form first. */
  heroOnMobile?: boolean;
  /** The form, placed inside the card. */
  children: ReactNode;
}

/**
 * The page frame shared by sign-in, sign-up and password reset: the site header, a welcome panel on
 * the left, and the form in a card on the right.
 */
export default function AuthSplitLayout({
  icon,
  title,
  subtitle,
  footnote,
  heroOnMobile = true,
  children,
}: AuthSplitLayoutProps) {
  const theme = useTheme();
  const accent = theme.palette.mode === "dark" ? NEON.dark : NEON.light;

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <LandingHeader />
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", py: { xs: 4, md: 0 } }}>
        <Container maxWidth="lg" sx={{ width: "100%" }}>
          <Grid container spacing={0} sx={{ minHeight: { md: "70vh" } }}>
            {/* Left side: welcome panel */}
            <Grid size={{ xs: 12, md: 6 }} sx={heroOnMobile ? undefined : { display: { xs: "none", md: "flex" } }}>
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: { xs: "center", md: "flex-start" },
                  px: { xs: 2, md: 6 },
                  py: { xs: 4, md: 8 },
                  textAlign: { xs: "center", md: "left" },
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 4, md: 12 },
                    borderRadius: 4,
                    backgroundColor: "transparent",
                    border: "1px solid",
                    borderColor: "divider",
                    position: "relative",
                    overflow: "hidden",
                    "&::after": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "2px",
                      background: `linear-gradient(90deg, transparent, ${accent.cyan}, transparent)`,
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      width: 80,
                      height: 80,
                      borderRadius: 3,
                      backgroundColor: "transparent",
                      border: "2px solid",
                      borderColor: "primary.main",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "primary.main",
                      mb: 3,
                      mx: { xs: "auto", md: 0 },
                    }}
                  >
                    {icon}
                  </Box>
                  <Typography
                    component="h1"
                    variant="h3"
                    fontWeight="bold"
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      mb: 2,
                      background: `linear-gradient(135deg, ${accent.cyan} 0%, ${accent.cyanMid} 50%, ${accent.blue} 100%)`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      fontSize: { xs: "2rem", md: "2.5rem" },
                    }}
                  >
                    {title}
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      color: "text.secondary",
                      mb: 3,
                      fontWeight: 400,
                      lineHeight: 1.6,
                    }}
                  >
                    {subtitle}
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ position: "relative", zIndex: 1, color: "text.secondary", opacity: 0.8 }}
                  >
                    {footnote}
                  </Typography>
                </Paper>
              </Box>
            </Grid>

            {/* Right side: the form */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  px: { xs: 2, md: 6 },
                  py: { xs: 4, md: 8 },
                }}
              >
                <Card
                  elevation={0}
                  sx={{
                    width: "100%",
                    maxWidth: 500,
                    mx: "auto",
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    backgroundColor: "background.paper",
                  }}
                >
                  <CardContent sx={{ padding: 4 }}>{children}</CardContent>
                </Card>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
