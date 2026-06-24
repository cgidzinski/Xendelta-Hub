import { Box, Button, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { usePWAUpdate } from "../hooks/usePWAUpdate";

// Thin, full-width, non-dismissable bar pinned to the top of the viewport. Only shown
// when a new version is waiting; reloading is the only way to clear it. zIndex sits above
// the OfflineIndicator (2000) so it stays visible if both happen to appear.
export default function UpdateBanner() {
  const { needRefresh, reload } = usePWAUpdate();

  if (!needRefresh) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2100,
        bgcolor: "primary.main",
        color: "primary.contrastText",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        py: 0.5,
        px: 2,
        boxShadow: 3,
      }}
    >
      <Typography variant="caption" fontWeight={600}>
        A new version is available
      </Typography>
      <Button
        size="small"
        color="inherit"
        variant="outlined"
        startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
        onClick={() => reload()}
        sx={{
          py: 0,
          minHeight: 24,
          textTransform: "none",
          borderColor: "currentColor",
        }}
      >
        Reload
      </Button>
    </Box>
  );
}
