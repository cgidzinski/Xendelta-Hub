import { Box, Collapse, Typography } from "@mui/material";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  return (
    <Collapse in={!isOnline}>
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2000,
          bgcolor: "warning.dark",
          color: "warning.contrastText",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          py: 0.75,
          px: 2,
        }}
      >
        <WifiOffIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption" fontWeight={600}>
          You're offline — data may not be up to date
        </Typography>
      </Box>
    </Collapse>
  );
}
