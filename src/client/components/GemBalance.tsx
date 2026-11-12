import { alpha } from "@mui/material/styles";
import { Typography, Box } from "@mui/material";
import { GemIcon } from "./icons/GemIcon";
import { GEM_COLOR } from "../theme";

interface GemBalanceProps {
  gems?: number;
  onNavigate?: () => void;
}

/** The sidebar pill showing the gem balance; opens the Shop. */
export default function GemBalance({ gems = 0, onNavigate }: GemBalanceProps) {
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
        borderColor: "divider",
        backgroundColor: "transparent",
        cursor: "pointer",
        "&:hover": { backgroundColor: (t) => alpha(GEM_COLOR, t.palette.action.hoverOpacity) },
      }}
    >
      <GemIcon sx={{ color: GEM_COLOR, fontSize: 24 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1, fontSize: "1.1rem" }}>
        {gems.toLocaleString()}
      </Typography>
    </Box>
  );
}
