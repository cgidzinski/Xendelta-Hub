import { useEffect, useState } from "react";
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  TextField,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
} from "@mui/material";
import {
  Security,
  Person,
  Settings as SettingsIcon,
  Notifications,
  Palette,
  Language,
  VolumeUp,
} from "@mui/icons-material";
import { useTitle } from "../../../hooks/useTitle";
import { useUserProfile, userProfileKeys, UserProfile } from "../../../hooks/user/useUserProfile";
import { OverlaySpinner } from "../../../components/LoadingSpinner";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../contexts/AuthContext";
import AuthProviderManager from "./components/AuthProviderManager";
import { useUserAvatar } from "../../../hooks/user/useUserAvatar";
import ProfileHeader from "./components/ProfileHeader";
import AvatarUploadSection from "./components/AvatarUploadSection";
import { cardSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
      <Box sx={{ display: "flex", color: "text.disabled" }}>{icon}</Box>
      <Typography variant="caption" sx={sectionLabelSx}>
        {label}
      </Typography>
    </Box>
  );
}

export default function Profile() {
  const [tab, setTab] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [mainAvatarUrl, setMainAvatarUrl] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Settings state
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [volume, setVolume] = useState(70);
  const [language, setLanguage] = useState("en");

  const { enqueueSnackbar } = useSnackbar();
  const { profile, isLoading, refetch, updateProfile } = useUserProfile();
  const { logout } = useAuth();
  const { uploadAvatar, isUploading: isUploadingAvatar } = useUserAvatar();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useTitle("Profile");

  useEffect(() => {
    if (profile?.avatar) {
      setMainAvatarUrl((current) => {
        const currentUrlWithoutParams = current?.split("?")[0];
        if (profile.avatar !== currentUrlWithoutParams) return profile.avatar;
        return current;
      });
    } else {
      setMainAvatarUrl(null);
    }
  }, [profile?.avatar]);

  useEffect(() => {
    if (profile?.username && !editUsername) setEditUsername(profile.username);
  }, [profile?.username]);

  const handleSaveUsername = async () => {
    const trimmed = editUsername.trim();
    if (!trimmed) { setUsernameError("Username cannot be empty"); return; }
    if (trimmed.length < 3) { setUsernameError("Username must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError("Username can only contain letters, numbers, and underscores"); return; }
    if (trimmed === profile?.username) { setUsernameError("That's already your username"); return; }
    setUsernameError("");
    setIsSavingUsername(true);
    try {
      await updateProfile({ username: trimmed });
      refetch();
      enqueueSnackbar("Username updated successfully!", { variant: "success" });
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || "Failed to update username";
      setUsernameError(msg);
    }
    setIsSavingUsername(false);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      enqueueSnackbar("Invalid file type. Please select an image file (jpg, png, gif, webp)", { variant: "error" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      enqueueSnackbar("File size too large. Maximum size is 5MB", { variant: "error" });
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setFilePreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpdateAvatar = async () => {
    if (!selectedFile) { enqueueSnackbar("Please select an image file", { variant: "error" }); return; }
    setIsUploading(true);
    try {
      const data = await uploadAvatar(selectedFile);
      if (!data || !data.avatar || typeof data.avatar !== "string") {
        enqueueSnackbar("Upload failed: Invalid response from server", { variant: "error" });
        setIsUploading(false);
        return;
      }
      const newAvatarUrl = data.avatar;
      enqueueSnackbar("Avatar uploaded successfully!", { variant: "success" });
      setSelectedFile(null);
      setFilePreviewUrl(null);
      const avatarUrlWithCache = `${newAvatarUrl}?t=${Date.now()}`;
      setMainAvatarUrl(avatarUrlWithCache);
      setAvatarKey((prev) => prev + 1);
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfile: UserProfile | undefined) => {
        if (!oldProfile) return oldProfile;
        return { ...oldProfile, avatar: avatarUrlWithCache };
      });
      refetch();
      setIsUploading(false);
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Failed to upload avatar";
      enqueueSnackbar(errorMessage, { variant: "error" });
      setIsUploading(false);
    }
  };

  if (isLoading) return <OverlaySpinner message="Loading your profile..." />;

  return (
    <Box sx={{ position: "relative" }}>
      <Container maxWidth="md" sx={{ mt: { xs: 2, sm: 4 } }}>
        {/* Page header */}
        <Box sx={{ mb: { xs: 2, sm: 3 } }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}>
            Profile
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Manage your account and preferences
          </Typography>
        </Box>

        {/* Header card always visible */}
        <Card variant="outlined" sx={{ ...cardSx, mb: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <ProfileHeader profile={profile} avatarUrl={mainAvatarUrl} avatarKey={avatarKey} />
          </CardContent>
        </Card>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
          <Tab label="Profile" />
          <Tab label="Settings" />
        </Tabs>

        {tab === 0 && (
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <AvatarUploadSection
                selectedFile={selectedFile}
                filePreviewUrl={filePreviewUrl}
                isUploading={isUploading}
                isUploadingAvatar={isUploadingAvatar}
                onFileSelect={handleFileSelect}
                onUpload={handleUpdateAvatar}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionHeader icon={<Person fontSize="small" />} label="Account Settings" />
                  <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                    <TextField
                      label="Username"
                      value={editUsername}
                      onChange={(e) => { setEditUsername(e.target.value); setUsernameError(""); }}
                      error={!!usernameError}
                      helperText={usernameError || "Letters, numbers, and underscores only"}
                      size="small"
                      sx={{ flex: 1, maxWidth: 320 }}
                      inputProps={{ maxLength: 50 }}
                    />
                    <Button variant="contained" onClick={handleSaveUsername} disabled={isSavingUsername} sx={{ mt: 0.5 }}>
                      {isSavingUsername ? "Saving..." : "Save"}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionHeader icon={<Security fontSize="small" />} label="Authentication Methods" />
                  <AuthProviderManager />
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="body1">Logout</Typography>
                      <Typography variant="body2" color="text.secondary">Logout of your account</Typography>
                    </Box>
                    <Button variant="outlined" size="small" color="error" onClick={() => logout()}>
                      Logout
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {tab === 1 && (
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionHeader icon={<Notifications fontSize="small" />} label="Notifications" />
                  <FormControlLabel
                    control={<Switch checked={notifications} onChange={(e) => setNotifications(e.target.checked)} disabled />}
                    label="Enable notifications"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Receive updates about your projects and activities
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }}>
                    Coming soon
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionHeader icon={<Palette fontSize="small" />} label="Appearance" />
                  <FormControlLabel
                    control={<Switch checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} disabled />}
                    label="Dark mode"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Switch between light and dark themes
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }}>
                    Coming soon
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionHeader icon={<SettingsIcon fontSize="small" />} label="General" />
                  <FormControlLabel
                    control={<Switch checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} disabled />}
                    label="Auto-save changes"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                    Automatically save your work as you type
                  </Typography>
                  <FormControl fullWidth size="small" sx={{ mt: 2 }} disabled>
                    <InputLabel>Language</InputLabel>
                    <Select value={language} label="Language" onChange={(e) => setLanguage(e.target.value)}>
                      <MenuItem value="en">English</MenuItem>
                      <MenuItem value="es">Spanish</MenuItem>
                      <MenuItem value="fr">French</MenuItem>
                      <MenuItem value="de">German</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }}>
                    Coming soon
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionHeader icon={<VolumeUp fontSize="small" />} label="Audio" />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Master Volume: {volume}%
                  </Typography>
                  <Slider
                    value={volume}
                    onChange={(_, v) => setVolume(v as number)}
                    valueLabelDisplay="auto"
                    step={10}
                    marks
                    min={0}
                    max={100}
                    disabled
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }}>
                    Coming soon
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionHeader icon={<Security fontSize="small" />} label="Security" />
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Box>
                      <Typography variant="body1">Two-Factor Authentication</Typography>
                      <Typography variant="body2" color="text.secondary">Add an extra layer of security to your account</Typography>
                    </Box>
                    <Button variant="outlined" size="small" disabled>Enable</Button>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Box>
                      <Typography variant="body1">Change Password</Typography>
                      <Typography variant="body2" color="text.secondary">Update your account password</Typography>
                    </Box>
                    <Button variant="outlined" size="small" disabled>Change</Button>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="body1">Active Sessions</Typography>
                      <Typography variant="body2" color="text.secondary">Manage your active login sessions</Typography>
                    </Box>
                    <Button variant="outlined" size="small" disabled>Manage</Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </Container>
    </Box>
  );
}
