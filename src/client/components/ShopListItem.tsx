import { alpha } from "@mui/material/styles";
import {
  Typography,
  Box,
} from "@mui/material";
import { PointsIcon } from "./icons/PointsIcon";
import { POINTS_GOLD } from "../theme";

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
        mt: 1,
        borderRadius: 2,
        border: 1,
        borderColor: "warning.main",
        backgroundColor: "transparent",
        cursor: "pointer",
        "&:hover": { backgroundColor: (t) => alpha(t.palette.warning.main, 0.1) },
      }}
    >
      <PointsIcon sx={{ color: POINTS_GOLD, fontSize: 24 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "warning.main", lineHeight: 1, fontSize: "1.1rem" }}>
        {points}
      </Typography>
    </Box>
  );
}
