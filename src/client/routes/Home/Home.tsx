import { Box, Container, Typography, Card, CardContent, Paper } from "@mui/material";
import Grid from "@mui/material/Grid";
import { Home as HomeIcon, Dashboard, Settings, People } from "@mui/icons-material";
import TitleBar from "../../components/TitleBar";
import { useAuth } from "../../contexts/AuthContext";

export default function Home() {
  const { user } = useAuth();

  return (
    <Box>
      <TitleBar title="Home" />
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

        {/* Quick Actions */}
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Quick Actions
          </Typography>
          <Typography variant="body1" color="text.secondary">
            This is a temporary home page. More features coming soon!
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
