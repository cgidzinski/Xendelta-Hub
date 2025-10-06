import { useEffect, useState } from "react";
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Avatar,
  Button,
  Paper,
  Divider,
  Grid,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Switch,
  TextField,
} from "@mui/material";
import { Settings as SettingsIcon, Notifications, Security, Palette, VolumeUp } from "@mui/icons-material";
import TitleBar from "../../components/TitleBar";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import { OverlaySpinner } from "../../components/LoadingSpinner";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";
export default function Profile() {
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [volume, setVolume] = useState(70);
  const [language, setLanguage] = useState("en");
  const [avatarUrl, setAvatarUrl] = useState("");
  const { enqueueSnackbar } = useSnackbar();
  const { profile, isLoading, updateProfile, isUpdating } = useUserProfile();
  const navigate = useNavigate();
  // const isValidImageUrl = (url: string): boolean => {
  //   try {
  //     new URL(url);
  //     return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url) || url.includes("data:image");
  //   } catch {
  //     return false;
  //   }
  // };
  useEffect(() => {
    setAvatarUrl(profile?.avatar || "");
  }, [profile]);

  const handleUpdateAvatar = async () => {
    if (!avatarUrl) {
      enqueueSnackbar("Please enter an image URL", { variant: "error" });
      return;
    }

    // if (!isValidImageUrl(avatarUrl)) {
    //   enqueueSnackbar("Please enter a valid image URL", { variant: "error" });
    //   return;
    // }

    const success = await updateProfile({ avatar: avatarUrl });
    if (success) {
      enqueueSnackbar("Avatar updated successfully!", { variant: "success" });
      setAvatarUrl(profile?.avatar || "");
    } else {
      enqueueSnackbar("Failed to update avatar", { variant: "error" });
    }
  };

  if (isLoading) {
    return <OverlaySpinner message="Loading your profile..." />;
  }

  return (
    <Box sx={{ position: "relative" }}>
      <TitleBar title="Profile" />
      <Container maxWidth="md" sx={{ mt: 4 }}>
        {isUpdating && <OverlaySpinner message="Updating profile..." />}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 4 }}>
                {/* Profile Header */}
                <Box sx={{ textAlign: "center", mb: 4 }}>
                  <Avatar
                    src={profile?.avatar}
                    sx={{
                      width: 120,
                      height: 120,
                      mx: "auto",
                      mb: 2,
                      fontSize: "3rem",
                      bgcolor: "primary.main",
                    }}
                  />

                  <Typography variant="h4" component="h1" gutterBottom>
                    {profile?.username}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    {profile?.email}
                  </Typography>
                </Box>

                {/* <Divider sx={{ my: 3 }} /> */}

                {/* Profile Details */}
                {/* <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3 }}>
                  <Box sx={{ flex: 1 }}>
                    <Paper elevation={1} sx={{ p: 3, height: "100%" }}>
                      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                        <PersonIcon color="primary" sx={{ mr: 1 }} />
                        <Typography variant="h6">Username</Typography>
                      </Box>

                      <Typography variant="body1" color="text.secondary">
                        {profile?.username}
                      </Typography>
                    </Paper>
                  </Box>

                  <Box sx={{ flex: 1 }}>
                    <Paper elevation={1} sx={{ p: 3, height: "100%" }}>
                      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                        <EmailIcon color="primary" sx={{ mr: 1 }} />
                        <Typography variant="h6">Email</Typography>
                      </Box>

                      <Typography variant="body1" color="text.secondary">
                        {profile?.email}
                      </Typography>
                    </Paper>
                  </Box>
                </Box> */}
              </CardContent>
            </Card>
          </Grid>

          {/* Avatar */}
          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Notifications color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Avatar</Typography>
                </Box>

                <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                  <TextField
                    fullWidth
                    label="Image URL"
                    placeholder="Paste image URL here..."
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    variant="outlined"
                    size="small"
                  />
                  <Button
                    variant="contained"
                    onClick={handleUpdateAvatar}
                    disabled={!avatarUrl || isUpdating}
                    sx={{ minWidth: 100, height: 40 }}
                  >
                    {isUpdating ? "Updating..." : "Update"}
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                  Enter a valid image URL (jpg, png, gif, webp, svg)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          {/* Security Settings */}
          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Security color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Security</Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Box
                    sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, opacity: 0.5 }}
                  >
                    <Box>
                      <Typography variant="body1">Two-Factor Authentication</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Add an extra layer of security to your account
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small">
                      Enable
                    </Button>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box
                    sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, opacity: 0.5 }}
                  >
                    <Box>
                      <Typography variant="body1">Change Password</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Update your account password
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small">
                      Change
                    </Button>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.5 }}>
                    <Box>
                      <Typography variant="body1">Active Sessions</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Manage your active login sessions
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small">
                      Manage
                    </Button>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="body1">Logout</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Logout of your account
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small" color="error" onClick={() => navigate("/logout")}>
                      Logout
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
