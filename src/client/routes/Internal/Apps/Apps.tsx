import { useNavigate } from "react-router-dom";
import { Box, Card, CardActionArea, CardContent, Typography, Container, Grid, IconButton } from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import BrushIcon from "@mui/icons-material/Brush";
import FolderIcon from "@mui/icons-material/Folder";
import LinkIcon from "@mui/icons-material/Link";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { usePinnedApps } from "../../../hooks/user/usePinnedApps";
import LoadingSpinner from "../../../components/LoadingSpinner";

const APPS_REGISTRY = [
  {
    key: "recipaint",
    label: "Recipaint",
    icon: <BrushIcon sx={{ fontSize: 36 }} />,
    path: "/internal/recipaint",
    description: "Create and manage your recipes",
  },
  {
    key: "xenbox",
    label: "XenBox",
    icon: <FolderIcon sx={{ fontSize: 36 }} />,
    path: "/internal/xenbox",
    description: "Store and share your files",
  },
  {
    key: "xenlink",
    label: "XenLink",
    icon: <LinkIcon sx={{ fontSize: 36 }} />,
    path: "/internal/xenlink",
    description: "Shorten and manage your links",
  },
  {
    key: "xensplit",
    label: "Xensplit",
    icon: <ReceiptLongIcon sx={{ fontSize: 36 }} />,
    path: "/internal/xensplit",
    description: "Split expenses with friends",
  },
];

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
            return (
              <Grid size={{ xs: 6 }} key={app.key}>
                <Card sx={{
                  height: "100%",
                  minHeight: 200,
                  minWidth: 0,
                  width: "100%",
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
                    onClick={() => navigate(app.path)}
                    sx={{
                      flexGrow: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                    }}
                  >
                    <Box sx={{
                      height: 120,
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
                    size="small"
                    onClick={(e) => {
                      e.preventDefault();
                      handleTogglePin(app.key);
                    }}
                    disabled={isUpdating}
                    sx={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      color: isPinned ? "warning.main" : "text.secondary",
                      bgcolor: "rgba(0,0,0,0.4)",
                      "&:hover": {
                        bgcolor: isPinned ? "warning.light" : "action.selected",
                      },
                    }}
                  >
                    {isPinned ? <PushPinIcon sx={{ fontSize: 14 }} /> : <PushPinOutlinedIcon sx={{ fontSize: 14 }} />}
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
