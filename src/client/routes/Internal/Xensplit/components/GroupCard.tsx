import { useNavigate } from "react-router-dom";
import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Box,
  Avatar,
  AvatarGroup,
  Chip,
} from "@mui/material";
import type { XenSplit } from "../../../hooks/xensplit/types";

interface GroupCardProps {
  group: XenSplit;
}

export function GroupCard({ group }: GroupCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      sx={{
        height: "100%",
        minHeight: 180,
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.2s, box-shadow 0.2s",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 6,
        },
      }}
    >
      <CardActionArea
        onClick={() => navigate(`/internal/xensplit/groups/${group._id}`)}
        sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "flex-start" }}
      >
        <CardContent sx={{ flexGrow: 1, width: "100%" }}>
          <Typography gutterBottom variant="h6" component="h2" sx={{ fontWeight: 600 }}>
            {group.name}
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 12 } }}>
              {group.members.map((member) => (
                <Avatar key={member.user_id} src={member.avatar || undefined} sx={{ bgcolor: "primary.main" }}>
                  {member.username[0]?.toUpperCase()}
                </Avatar>
              ))}
            </AvatarGroup>
            <Typography variant="caption" color="text.secondary">
              {group.members.length} {group.members.length === 1 ? "member" : "members"}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip
              label={`${group.expenses?.length || 0} expenses`}
              size="small"
              variant="outlined"
            />
            {group.settlements?.length > 0 && (
              <Chip
                label={`${group.settlements.length} settled`}
                size="small"
                color="success"
                variant="outlined"
              />
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default GroupCard;