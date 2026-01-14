import { Box, Container, Typography, Grid, Card, CardContent, CardHeader } from "@mui/material";
import { Security, Chat, Notifications, Speed, Group, CloudDone } from "@mui/icons-material";
import LandingHeader from "../../../components/LandingHeader";

export default function Features() {
  const features = [
    {
      icon: <Chat sx={{ fontSize: 40 }} />,
      title: "XenChat",
      caption: "Real-time Messaging",
      description: "Connect through instant messaging and group conversations.",
    },
    {
      icon: <Speed sx={{ fontSize: 40 }} />,
      title: "XenBox",
      caption: "File Sharing",
      description: "Share files with people through our secure and efficient file sharing system.",
    },
    {
      icon: <Group sx={{ fontSize: 40 }} />,
      title: "Recipaint",
      caption: "Miniature Painting Planner",
      description: "Plan your miniature painting projects with ease using our step by step paint planner.",
    },
    // {
    //   icon: <Notifications sx={{ fontSize: 40 }} />,
    //   title: "Smart Notifications",
    //   caption: "Space Filler!",
    //   description: "Stay updated with intelligent notifications that prioritize what matters most to you.",
    // },
    // {
    //   icon: <Security sx={{ fontSize: 40 }} />,
    //   title: "Enterprise Security",
    //   caption: "Space Filler!",
    //   description: "Your data is protected with industry-standard security measures and compliance certifications.",
    // },
    // {
    //   icon: <CloudDone sx={{ fontSize: 40 }} />,
    //   title: "Cloud Powered",
    //   caption: "Space Filler!",
    //   description: "Access your workspace from anywhere, on any device, with automatic cloud synchronization.",
    // },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.default",
      }}
    >
      <LandingHeader />
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 }, flex: 1 }}>
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 700,
              mb: 2,
              color: "text.primary",
              background: "linear-gradient(90deg, #00f5ff 0%, #00d4ff 50%, #00a8ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Powerful Features
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: "text.secondary",
              maxWidth: 600,
              mx: "auto",
              fontWeight: 400,
            }}
          >
            Everything you need to collaborate effectively and stay productive
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
              <Card
                elevation={0}
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  transition: "all 0.3s ease",
                  "&:hover": {
                    transform: "translateY(-8px)",
                    boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
                    borderColor: "primary.main",
                  },
                }}
              >
                <CardContent sx={{ p: 4, flex: 1, display: "flex", flexDirection: "column" }}>
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 2,
                      backgroundColor: "transparent",
                      border: "2px solid",
                      borderColor: "primary.main",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "primary.main",
                      mb: 3,
                      boxShadow: "0 0 15px rgba(0, 245, 255, 0.2)",
                      transition: "all 0.3s ease",
                      "&:hover": {
                        boxShadow: "0 0 25px rgba(0, 245, 255, 0.4)",
                        transform: "scale(1.05)",
                      },
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "text.secondary" }}>
                      {feature.caption}
                    </Typography>
                  </Box>
                  <Typography
                    variant="h5"
                    component="h3"
                    sx={{
                      fontWeight: 600,
                      mb: 1.5,
                      color: "text.primary",
                    }}
                  >
                    {feature.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      lineHeight: 1.7,
                    }}
                  >
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
