import { useEffect, useState } from "react";
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
} from "@mui/material";
import { Security } from "@mui/icons-material";
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
export default function Profile() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null); // Preview for selected file only
  const [mainAvatarUrl, setMainAvatarUrl] = useState<string | null>(null); // Main avatar from profile
  const [avatarKey, setAvatarKey] = useState(0); // Key to force Avatar re-render
  const [isUploading, setIsUploading] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const { profile, isLoading, refetch } = useUserProfile();
  const { logout } = useAuth();
  const { uploadAvatar, isUploading: isUploadingAvatar } = useUserAvatar();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  useTitle("Profile");
  
  useEffect(() => {
    // Update avatar URL from profile (ignore query params when comparing)
    if (profile?.avatar) {
      setMainAvatarUrl((current) => {
        const currentUrlWithoutParams = current?.split('?')[0];
        if (profile.avatar !== currentUrlWithoutParams) {
          return profile.avatar;
        }
        return current;
      });
    } else {
      setMainAvatarUrl(null);
    }
  }, [profile?.avatar]);

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
    try {
      const data = await uploadAvatar(selectedFile);
      // Validate response has avatar URL
      if (!data || !data.avatar || typeof data.avatar !== "string") {
        enqueueSnackbar("Upload failed: Invalid response from server", { variant: "error" });
        setIsUploading(false);
        return;
      }
      
      const newAvatarUrl = data.avatar;
      enqueueSnackbar("Avatar uploaded successfully!", { variant: "success" });
      setSelectedFile(null);
      setFilePreviewUrl(null);
      
      // Update avatar URL immediately with cache-busting timestamp
      const avatarUrlWithCache = `${newAvatarUrl}?t=${Date.now()}`;
      setMainAvatarUrl(avatarUrlWithCache);
      setAvatarKey((prev) => prev + 1);
      
      // Update the query cache directly with the new avatar URL (with cache-busting)
      // This ensures the sidebar and other components using the profile see the new avatar immediately
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfile: UserProfile | undefined) => {
        if (!oldProfile) return oldProfile;
        return {
          ...oldProfile,
          avatar: avatarUrlWithCache,
        };
      });
      
      // Refetch profile to get latest data from server (this will update the cache with server data)
      refetch();
      setIsUploading(false);
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Failed to upload avatar";
      enqueueSnackbar(errorMessage, { variant: "error" });
      // Don't update avatar state on error - keep current avatar
      // Don't clear selected file so user can try again
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return <OverlaySpinner message="Loading your profile..." />;
  }

  return (
    <Box sx={{ position: "relative" }}>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 4 }}>
                <ProfileHeader
                  profile={profile}
                  avatarUrl={mainAvatarUrl}
                  avatarKey={avatarKey}
                />
              </CardContent>
            </Card>
          </Grid>

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
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={() => {
                      logout();
                    }}
                  >
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
