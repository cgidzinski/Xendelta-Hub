import { useMemo } from "react";
import { ListItem, ListItemButton, ListItemAvatar, ListItemText, Box } from "@mui/material";
import { UserProfile } from "../hooks/user/useUserProfile";
import UserName from "./user/UserName";
import UserAvatar from "./user/UserAvatar";

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
      <ListItemButton sx={{ pl: 1 }} disableGutters onClick={onNavigate} selected={isSelected}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", flexDirection: "row", gap: 1 }}>
            <ListItemAvatar>
              <UserAvatar
                key={avatarUrl || profile?._id} // Force re-render when avatar URL changes
                user={profile}
                sx={{ width: 48, height: 48, borderRadius: 2 }}
              >
                {profile?.username?.charAt(0).toUpperCase()}
              </UserAvatar>
            </ListItemAvatar>
            <ListItemText primary={<UserName user={profile} />} secondary={profile?.email} />
          </Box>
        </Box>
      </ListItemButton>
    </ListItem>
  );
}
