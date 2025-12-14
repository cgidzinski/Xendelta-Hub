import { useState, useEffect } from "react";
import { ListItem, ListItemButton, ListItemAvatar, ListItemText, Avatar } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserProfile } from "../hooks/user/useUserProfile";

export default function ProfileListItem() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUserProfile();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile?._id) {
      // Use cache-busting timestamp to ensure avatar updates immediately
      setAvatarUrl(`/avatar/${profile._id}?t=${Date.now()}`);
    } else {
      setAvatarUrl(null);
    }
  }, [profile?._id, profile?.avatar]);

  return (
    <ListItem disablePadding>
      <ListItemButton
        sx={{ pl: 1 }}
        disableGutters
        onClick={() => navigate("/internal/profile")}
        selected={location.pathname.endsWith("/internal/profile")}
      >
        <ListItemAvatar>
          <Avatar
            src={avatarUrl || undefined}
            sx={{ width: 48, height: 48, borderRadius: 2 }}
          >
            {profile?.username?.charAt(0).toUpperCase()}
          </Avatar>
        </ListItemAvatar>
        <ListItemText primary={profile?.username} secondary={profile?.email} />
      </ListItemButton>
    </ListItem>
  );
}

