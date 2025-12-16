import { Box, Avatar, Typography } from "@mui/material";
import { UserProfile } from "../../../../hooks/user/useUserProfile";

interface ProfileHeaderProps {
  profile: UserProfile | undefined;
  avatarUrl: string | null;
  avatarKey: number;
}

export default function ProfileHeader({
  profile,
  avatarUrl,
  avatarKey,
}: ProfileHeaderProps) {
  return (
    <Box sx={{ textAlign: "center", mb: 4 }}>
      <Avatar
        key={avatarKey}
        src={avatarUrl || profile?.avatar}
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
    </Box>
  );
}

