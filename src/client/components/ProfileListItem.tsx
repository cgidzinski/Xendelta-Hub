import { useMemo } from "react";
import { ListItem, ListItemButton, ListItemAvatar, ListItemText, Avatar } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserProfile } from "../hooks/user/useUserProfile";

interface ProfileListItemProps {
  onNavigate?: () => void;
}

export default function ProfileListItem({ onNavigate }: ProfileListItemProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUserProfile();
  
  // Use direct avatar URL from profile
  const avatarUrl = useMemo(() => {
    return profile?.avatar;
  }, [profile?.avatar]);

  const handleClick = () => {
    navigate("/internal/profile");
    onNavigate?.();
  };

  return (
    <ListItem disablePadding>
      <ListItemButton
        sx={{ pl: 1 }}
        disableGutters
        onClick={handleClick}
        selected={location.pathname.endsWith("/internal/profile")}
      >
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
      </ListItemButton>
    </ListItem>
  );
}

