import { Box, Collapse, Typography } from "@mui/material";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import { useAuth } from "../../contexts/AuthContext";
import { useQueuedItems } from "../../offline/offlineRuntime";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const waiting = useQueuedItems(user?.id).length;

  return (
    <Collapse in={!isOnline || waiting > 0}>
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
          {isOnline
            ? `Saving ${waiting} change${waiting === 1 ? "" : "s"}…`
            : waiting > 0
              ? `You're offline. ${waiting} change${waiting === 1 ? "" : "s"} will be saved when you're back`
              : "You're offline. You can read your notes, routines and recipes; data may be out of date"}
        </Typography>
      </Box>
    </Collapse>
  );
}
