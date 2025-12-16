import { Box, Container, Typography, Card, CardContent, Paper, Link, IconButton, Button, Stack, Divider } from "@mui/material";
import Grid from "@mui/material/Grid";
import { Home as HomeIcon, Dashboard, Settings, People, GitHub, LinkedIn, Email, Description } from "@mui/icons-material";
import { useTitle } from "../../../hooks/useTitle";
import { useAuth } from "../../../contexts/AuthContext";

export default function Home() {
  const { user } = useAuth();
  useTitle("Home");

  return (
    <Box>
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        {/* Welcome Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Welcome back, {user?.username || "User"}!
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Here's what's happening in your Xendelta Hub
          </Typography>
        </Box>

        {/* Quick Stats Cards */}
        <Box sx={{ mb: 4 }}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={2}>
                <CardContent sx={{ textAlign: "center", p: 3 }}>
                  <HomeIcon sx={{ fontSize: 40, color: "primary.main", mb: 1 }} />
                  <Typography variant="h4" component="div">
                    12
                  </Typography>
                  <Typography color="text.secondary">Active Projects</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={2}>
                <CardContent sx={{ textAlign: "center", p: 3 }}>
                  <Dashboard sx={{ fontSize: 40, color: "secondary.main", mb: 1 }} />
                  <Typography variant="h4" component="div">
                    8
                  </Typography>
                  <Typography color="text.secondary">Completed Tasks</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={2}>
                <CardContent sx={{ textAlign: "center", p: 3 }}>
                  <People sx={{ fontSize: 40, color: "success.main", mb: 1 }} />
                  <Typography variant="h4" component="div">
                    24
                  </Typography>
                  <Typography color="text.secondary">Team Members</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={2}>
                <CardContent sx={{ textAlign: "center", p: 3 }}>
                  <Settings sx={{ fontSize: 40, color: "warning.main", mb: 1 }} />
                  <Typography variant="h4" component="div">
                    3
                  </Typography>
                  <Typography color="text.secondary">Pending Items</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Recent Activity */}
        <Paper elevation={1} sx={{ p: 3 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Recent Activity
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              • Project "Alpha" was updated 2 hours ago
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              • New team member joined yesterday
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              • Task "Design Review" was completed
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              • System maintenance scheduled for tomorrow
            </Typography>
          </Box>
        </Paper>

        {/* Credits Section */}
        <Box sx={{ mt: 6, mb: 4 }}>
          <Divider sx={{ mb: 3 }} />
          <Paper elevation={1} sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              This page was made by <strong>Colin Gidzinski</strong>
            </Typography>
            <Stack
              direction="row"
              spacing={2}
              justifyContent="center"
              alignItems="center"
              flexWrap="wrap"
              sx={{ gap: 2 }}
            >
              <IconButton
                component={Link}
                href="http://github.com/cgidzinski"
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                sx={{
                  "&:hover": {
                    backgroundColor: "primary.main",
                    color: "white",
                  },
                }}
              >
                <GitHub />
              </IconButton>
              <IconButton
                component={Link}
                href="http://linkedin.com/in/colin-gidzinski"
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                sx={{
                  "&:hover": {
                    backgroundColor: "primary.main",
                    color: "white",
                  },
                }}
              >
                <LinkedIn />
              </IconButton>
              <IconButton
                component={Link}
                href="mailto:colingidzinski@gmail.com"
                color="primary"
                sx={{
                  "&:hover": {
                    backgroundColor: "primary.main",
                    color: "white",
                  },
                }}
              >
                <Email />
              </IconButton>
              <Button
                variant="outlined"
                startIcon={<Description />}
                component={Link}
                href="https://storage.googleapis.com/xendelta-hub-public/Resume-Colin%20Gidzinski.pdf"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  ml: 1,
                  "&:hover": {
                    backgroundColor: "primary.main",
                    color: "white",
                    borderColor: "primary.main",
                  },
                }}
              >
                Resume
              </Button>
            </Stack>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}
