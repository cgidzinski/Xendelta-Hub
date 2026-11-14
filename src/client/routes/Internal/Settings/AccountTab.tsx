import { useEffect, useState } from "react";
import { Button, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../../components/ui/SectionCard";
import { useAuth } from "../../../contexts/AuthContext";
import { useUserProfile, userProfileKeys, type UserProfile } from "../../../hooks/user/useUserProfile";
import { useUserAvatar } from "../../../hooks/user/useUserAvatar";
import AvatarUploadSection from "./components/AvatarUploadSection";
import TimezoneSection from "./components/TimezoneSection";
import ETransferSection from "./components/ETransferSection";

/** Who you are: photo, name, the address you sign in with, your zone, and where people send you money. */
export default function AccountTab() {
  const { profile, refetch, updateProfile } = useUserProfile();
  const { logout } = useAuth();
  const { uploadAvatar, isUploading: isUploadingAvatar } = useUserAvatar();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  useEffect(() => {
    // Fill the field once the profile arrives, without overwriting what the person is typing.
    setEditUsername((current) => (profile?.username && !current ? profile.username : current));
  }, [profile?.username]);

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
    if (!selectedFile) {
      enqueueSnackbar("Please select an image file", { variant: "error" });
      return;
    }
    setIsUploading(true);
    try {
      const data = await uploadAvatar(selectedFile);
      if (!data || !data.avatar || typeof data.avatar !== "string") {
        enqueueSnackbar("Upload failed: Invalid response from server", { variant: "error" });
        return;
      }
      enqueueSnackbar("Avatar uploaded successfully!", { variant: "success" });
      setSelectedFile(null);
      setFilePreviewUrl(null);
      // The URL stays the same, so the picture is busted with a query string until the server's copy is re-read.
      const avatarUrlWithCache = `${data.avatar}?t=${Date.now()}`;
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfile: UserProfile | undefined) =>
        oldProfile ? { ...oldProfile, avatar: avatarUrlWithCache } : oldProfile,
      );
      refetch();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : "Failed to upload avatar", { variant: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveUsername = async () => {
    const trimmed = editUsername.trim();
    if (!trimmed) {
      setUsernameError("Username cannot be empty");
      return;
    }
    if (trimmed.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError("Username can only contain letters, numbers, and underscores");
      return;
    }
    if (trimmed === profile?.username) {
      setUsernameError("That's already your username");
      return;
    }
    setUsernameError("");
    setIsSavingUsername(true);
    try {
      await updateProfile({ username: trimmed });
      refetch();
      enqueueSnackbar("Username updated successfully!", { variant: "success" });
    } catch (error: any) {
      setUsernameError(error?.response?.data?.message || error?.message || "Failed to update username");
    } finally {
      setIsSavingUsername(false);
    }
  };

  return (
    <Stack spacing={2}>
      <AvatarUploadSection
        selectedFile={selectedFile}
        filePreviewUrl={filePreviewUrl}
        avatarUrl={profile?.avatar ?? null}
        isUploading={isUploading}
        isUploadingAvatar={isUploadingAvatar}
        onFileSelect={handleFileSelect}
        onUpload={handleUpdateAvatar}
      />

      <SectionCard title="Name" description="This is what people see next to the things you share.">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }}>
          <TextField
            label="Username"
            value={editUsername}
            onChange={(e) => {
              setEditUsername(e.target.value);
              setUsernameError("");
            }}
            error={!!usernameError}
            helperText={usernameError || "Letters, numbers, and underscores only"}
            size="small"
            sx={{ flex: 1, maxWidth: 320 }}
            slotProps={{ htmlInput: { maxLength: 50 } }}
          />
          <Button variant="contained" onClick={handleSaveUsername} disabled={isSavingUsername}>
            {isSavingUsername ? "Saving..." : "Save"}
          </Button>
        </Stack>
      </SectionCard>

      <SectionCard title="Email" description="Used to sign in and for account mail. It can't be changed here.">
        <Typography variant="body1">{profile?.email}</Typography>
      </SectionCard>

      <SectionCard title="Timezone" description="How dates and months are shown to you.">
        <TimezoneSection />
      </SectionCard>

      <SectionCard title="E-transfer" description="Where people in XenSplit send their share when they settle up.">
        <ETransferSection />
      </SectionCard>

      <SectionCard title="Sign out" description="Sign out of this device. Your account stays as it is." danger>
        <Button variant="outlined" color="error" onClick={() => logout()} sx={{ alignSelf: "flex-start" }}>
          Sign out
        </Button>
      </SectionCard>
    </Stack>
  );
}
