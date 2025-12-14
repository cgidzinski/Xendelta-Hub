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
import { useTitle } from "../../../hooks/useTitle";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { OverlaySpinner } from "../../../components/LoadingSpinner";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AuthProviderManager from "./components/AuthProviderManager";
export default function Profile() {
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [volume, setVolume] = useState(70);
  const [language, setLanguage] = useState("en");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null); // Preview for selected file only
  const [mainAvatarUrl, setMainAvatarUrl] = useState<string | null>(null); // Main avatar from profile
  const [avatarKey, setAvatarKey] = useState(0); // Key to force Avatar re-render
  const [isUploading, setIsUploading] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const { profile, isLoading, updateProfile, isUpdating, refetch } = useUserProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (profile?._id) {
      // Always use the /avatar/:userId endpoint for consistency
      // This endpoint handles both local and external avatars
      setMainAvatarUrl(`/avatar/${profile._id}?t=${Date.now()}`);
    } else {
      setMainAvatarUrl(null);
    }
  }, [profile?._id, profile?.avatar]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        enqueueSnackbar("Invalid file type. Please select an image file (jpg, png, gif, webp)", { variant: "error" });
        return;
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        enqueueSnackbar("File size too large. Maximum size is 5MB", { variant: "error" });
        return;
      }

      setSelectedFile(file);
      // Create preview URL for file selection (only shown in upload section, not main avatar)
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateAvatar = async () => {
    if (!selectedFile) {
      enqueueSnackbar("Please select an image file", { variant: "error" });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("avatar", selectedFile);

    const token = localStorage.getItem("token");
    const response = await fetch("/api/user/avatar", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (data.status) {
      enqueueSnackbar("Avatar uploaded successfully!", { variant: "success" });
      setSelectedFile(null);
      setFilePreviewUrl(null);
      // Force avatar refresh immediately with cache-busting timestamp
      if (profile?._id) {
        setMainAvatarUrl(`/avatar/${profile._id}?t=${Date.now()}`);
        setAvatarKey((prev) => prev + 1); // Force Avatar component to re-render
      }
      // Update profile cache immediately with new avatar path
      if (profile && data.data?.avatar) {
        queryClient.setQueryData(["userProfile"], {
          ...profile,
          avatar: data.data.avatar,
        });
      }
      // Invalidate and refetch profile to update all components using the profile (NavBar, ProfileListItem, etc.)
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      refetch();
    } else {
      enqueueSnackbar(data.message || "Failed to upload avatar", { variant: "error" });
    }
    setIsUploading(false);
  };

  if (isLoading) {
    return <OverlaySpinner message="Loading your profile..." />;
  }

  useTitle("Profile");

  return (
    <Box sx={{ position: "relative" }}>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        {isUpdating && <OverlaySpinner message="Updating profile..." />}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 4 }}>
                {/* Profile Header */}
                <Box sx={{ textAlign: "center", mb: 4 }}>
                  <Avatar
                    key={avatarKey}
                    src={mainAvatarUrl || undefined}
                    alt={profile?.username || "User"}
                    sx={{
                      width: 120,
                      height: 120,
                      mx: "auto",
                      mb: 2,
                      fontSize: "3rem",
                      bgcolor: "primary.main",
                      borderRadius: 2,
                    }}
                  >
                    {profile?.username?.charAt(0).toUpperCase()}
                  </Avatar>

                  <Typography variant="h4" component="h1" gutterBottom>
                    {profile?.username}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    {profile?.email}
                  </Typography>
                  {profile?.roles && profile.roles.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Roles: {profile.roles.join(", ")}
                      </Typography>
                    </Box>
                  )}
                  {!profile?.roles?.some((role: string) => role.toLowerCase() === "admin") && (
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={async () => {
                        const token = localStorage.getItem("token");
                        const response = await fetch("/api/user/make-admin", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                        });
                        const data = await response.json();
                        if (data.status) {
                          enqueueSnackbar("Admin role added successfully! Please refresh the page.", {
                            variant: "success",
                          });
                          setTimeout(() => {
                            window.location.reload();
                          }, 1500);
                        } else {
                          enqueueSnackbar("Failed to add admin role", { variant: "error" });
                        }
                      }}
                      sx={{ mt: 1 }}
                    >
                      Make Me Admin
                    </Button>
                  )}
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

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Button variant="outlined" component="label" disabled={isUploading}>
                      Choose File
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/jpg,image/png,image/gif"
                        onChange={handleFileSelect}
                      />
                    </Button>
                    <Button
                      variant="contained"
                      onClick={handleUpdateAvatar}
                      disabled={!selectedFile || isUploading}
                      sx={{ minWidth: 100 }}
                    >
                      {isUploading ? "Uploading..." : "Upload"}
                    </Button>
                  </Box>
                  {selectedFile && (
                    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                      {filePreviewUrl && (
                        <Avatar src={filePreviewUrl} sx={{ width: 128, height: 128, borderRadius: 2 }} />
                      )}
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Selected: {selectedFile.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {(selectedFile.size / 1024).toFixed(2)} KB - Click "Upload" to apply
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Supported formats: JPG, PNG, GIF, WEBP (Max 5MB)
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Security color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Authentication Methods</Typography>
                </Box>
                <AuthProviderManager />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
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
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
