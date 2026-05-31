import { useNavigate } from "react-router-dom";
import { Box, Card, CardContent, Typography, Container, Grid, IconButton, Avatar } from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import { APPS_REGISTRY } from "../../../constants/apps";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { usePinnedApps } from "../../../hooks/user/usePinnedApps";
import LoadingSpinner from "../../../components/LoadingSpinner";

// APPS_REGISTRY now imported from constants/apps.ts

export default function Apps() {
  const navigate = useNavigate();
  const { profile, isLoading } = useUserProfile();
  const { togglePinnedApp, isUpdating } = usePinnedApps();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const pinnedApps = profile?.pinnedApps || [];

  const handleTogglePin = async (appKey: string) => {
    await togglePinnedApp(appKey, pinnedApps);
  };

  return (
    <Box>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          All Apps
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Pin your favorite apps to the navbar for quick access
        </Typography>

        <Grid container spacing={3}>
          {APPS_REGISTRY.map((app) => {
            const isPinned = pinnedApps.includes(app.key);
            const Icon = app.icon;
            return (
              <Grid size={{ xs: 12, sm: 6 }} key={app.key}>
                <Card
                  variant="outlined"
                  onClick={() => navigate(app.path)}
                  sx={{
                    borderRadius: 3,
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    cursor: "pointer",
                    transition: "box-shadow 0.2s",
                    "&:hover": { boxShadow: 4 },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, pt: 2, pb: 1 }}>
                    <Avatar sx={{ bgcolor: "primary.light", width: 36, height: 36 }}>
                      {Icon && <Icon sx={{ fontSize: 22 }} />}
                    </Avatar>
                    <Typography variant="h6" sx={{ flex: 1 }}>
                      {app.label}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(app.key);
                      }}
                      disabled={isUpdating}
                      aria-label={isPinned ? "Unpin" : "Pin"}
                      sx={{
                        color: isPinned ? "warning.main" : "action.active",
                        "&:hover": isPinned
                          ? { color: "warning.dark", bgcolor: "warning.50" }
                          : { color: "primary.main", bgcolor: "primary.50" },
                      }}
                    >
                      {isPinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
                    </IconButton>
                  </Box>
                  <CardContent sx={{ pt: 0 }}>
                    <Typography variant="body2" color="text.secondary">
                      {app.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    </Box>
  );
}
