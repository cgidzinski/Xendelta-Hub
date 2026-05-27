import { Box, Card, CardActionArea, CardContent, Typography, Container, Grid, IconButton } from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import BrushIcon from "@mui/icons-material/Brush";
import FolderIcon from "@mui/icons-material/Folder";
import LinkIcon from "@mui/icons-material/Link";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { usePinnedApps } from "../../../hooks/user/usePinnedApps";
import LoadingSpinner from "../../../components/LoadingSpinner";

const APPS_REGISTRY = [
  {
    key: "recipaint",
    label: "Recipaint",
    icon: <BrushIcon sx={{ fontSize: 40 }} />,
    path: "/internal/recipaint",
    description: "Create and manage your recipes",
  },
  {
    key: "xenbox",
    label: "XenBox",
    icon: <FolderIcon sx={{ fontSize: 40 }} />,
    path: "/internal/xenbox",
    description: "Store and share your files",
  },
  {
    key: "xenlink",
    label: "XenLink",
    icon: <LinkIcon sx={{ fontSize: 40 }} />,
    path: "/internal/xenlink",
    description: "Shorten and manage your links",
  },
];

export default function Apps() {
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
            return (
              <Grid item xs={12} sm={6} md={4} key={app.key}>
                <Card sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  position: "relative",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 6,
                  },
                }}>
                  <CardActionArea
                    href={app.path}
                    sx={{
                      flexGrow: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                    }}
                  >
                    <Box sx={{
                      p: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      bgcolor: "action.hover",
                      color: "primary.main",
                    }}>
                      {app.icon}
                    </Box>
                    <CardContent sx={{ flexGrow: 1, width: "100%" }}>
                      <Typography gutterBottom variant="h6" component="h2" sx={{ fontWeight: 600 }}>
                        {app.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {app.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                  <IconButton
                    onClick={(e) => {
                      e.preventDefault();
                      handleTogglePin(app.key);
                    }}
                    disabled={isUpdating}
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      color: isPinned ? "warning.main" : "text.secondary",
                      bgcolor: "rgba(0,0,0,0.5)",
                      "&:hover": {
                        bgcolor: isPinned ? "warning.light" : "action.selected",
                      },
                    }}
                  >
                    {isPinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
                  </IconButton>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    </Box>
  );
}
