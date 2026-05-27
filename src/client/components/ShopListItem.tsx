import {
  Typography,
  Box,
} from "@mui/material";
import { PointsIcon } from "./icons/PointsIcon";

interface PointsListItemProps {
  points?: number;
  onNavigate?: () => void;
}

export default function PointsListItemSidebar({ points = 0, onNavigate }: PointsListItemProps) {
  return (
    <Box
      onClick={onNavigate}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        mx: 1,
        borderRadius: 2,
        border: 1,
        borderColor: "warning.main",
        backgroundColor: "transparent",
        cursor: "pointer",
        "&:hover": { backgroundColor: "rgba(255, 193, 7, 0.1)" },
      }}
    >
      <PointsIcon sx={{ color: "#FFD700", fontSize: 24 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "warning.main", lineHeight: 1, fontSize: "1.1rem" }}>
        {points}
      </Typography>
    </Box>
  );
}
