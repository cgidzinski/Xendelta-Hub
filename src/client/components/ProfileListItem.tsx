import { useState, useEffect, useMemo } from "react";
import { ListItem, ListItemButton, ListItemAvatar, ListItemText, Avatar } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserProfile } from "../hooks/user/useUserProfile";

export default function ProfileListItem() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUserProfile();
  
  // Use direct avatar URL from profile
  const avatarUrl = useMemo(() => {
    return profile?.avatar;
  }, [profile?.avatar]);

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

