import { useMemo } from "react";
import {
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  LinearProgress,
  Typography,
  Box,
} from "@mui/material";
import { UserProfile } from "../hooks/user/useUserProfile";
import { formatFileSize } from "../utils/fileUtils";

interface ProfileListItemProps {
  onNavigate?: () => void;
  profile?: UserProfile;
  isSelected: boolean;
}

export default function ProfileListItem({ profile, onNavigate, isSelected }: ProfileListItemProps) {

  // Use direct avatar URL from profile
  const avatarUrl = useMemo(() => {
    return profile?.avatar;
  }, [profile?.avatar]);

  return (
    <ListItem disablePadding>
      <ListItemButton
        sx={{ pl: 1 }}
        disableGutters
        onClick={onNavigate}
        selected={isSelected}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", flexDirection: "row", gap: 1 }}>
            <ListItemAvatar>
              <Avatar
                key={avatarUrl || profile?._id} // Force re-render when avatar URL changes
                src={avatarUrl}
                sx={{ width: 48, height: 48, borderRadius: 2 }}
              >
                {profile?.username?.charAt(0).toUpperCase()}
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary={profile?.username} secondary={profile?.email} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <LinearProgress
              variant="determinate"
              value={((profile?.xenbox?.spaceUsed || 0) / (profile?.xenbox?.spaceAllowed || 0)) * 100}
            />
            <Box sx={{ display: "flex", flexDirection: "row", gap: 1, justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary" textAlign="start">
                {profile?.xenbox?.fileCount} Files
              </Typography>
              <Typography variant="body2" color="text.secondary" textAlign="end">
                {formatFileSize(profile?.xenbox?.spaceUsed || 0)} / {formatFileSize(profile?.xenbox?.spaceAllowed || 0)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </ListItemButton>
    </ListItem>
  );
}
