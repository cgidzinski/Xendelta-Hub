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
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { XenSplit } from "../../../hooks/xensplit/types";

const ACCENT_COLORS = [
  "#2196f3", "#9c27b0", "#e91e63", "#ff5722",
  "#4caf50", "#ff9800", "#00bcd4", "#7c4dff",
];

function groupAccentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  }
  return ACCENT_COLORS[hash % ACCENT_COLORS.length];
}

interface GroupCardProps {
  group: XenSplit;
}

export function GroupCard({ group }: GroupCardProps) {
  const navigate = useNavigate();
  const accentColor = groupAccentColor(group.name);

  return (
    <Card
      elevation={0}
      sx={{
        width: "100%",
        border: 1,
        borderColor: "divider",
        transition: "border-color 0.15s, box-shadow 0.15s",
        "&:hover": {
          borderColor: accentColor,
          boxShadow: `0 0 0 1px ${accentColor}40`,
        },
      }}
    >
      <CardActionArea
        onClick={() => navigate(`/internal/xensplit/groups/${group._id}`)}
      >
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* Colored group initial */}
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: accentColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.2rem", lineHeight: 1 }}>
                {group.name[0]?.toUpperCase() ?? "?"}
              </Typography>
            </Box>

            {/* Name + members */}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, lineHeight: 1.25, mb: 0.5 }}
                noWrap
              >
                {group.name}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <AvatarGroup
                    max={4}
                    sx={{ "& .MuiAvatar-root": { width: 24, height: 24, fontSize: 10, border: "1.5px solid", borderColor: "background.paper" } }}
                  >
                    {group.members.map((member) => (
                      <Avatar
                        key={member.user_id}
                        src={member.avatar || undefined}
                        sx={{ bgcolor: "primary.dark" }}
                      >
                        {member.username[0]?.toUpperCase()}
                      </Avatar>
                    ))}
                  </AvatarGroup>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                  {group.expenses?.length || 0} expenses
                </Typography>
              </Box>
            </Box>

            {/* Right side */}
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, flexShrink: 0 }}>
              {group.settlements?.length > 0 && (
                <Chip
                  label={`${group.settlements.length} settled`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontSize: "0.65rem", height: 20 }}
                />
              )}
              <ChevronRightIcon sx={{ color: "text.disabled", fontSize: 20 }} />
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default GroupCard;
