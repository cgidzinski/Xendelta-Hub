import { Paper, Box, Typography, Button, IconButton, Slide } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import IosShareIcon from "@mui/icons-material/IosShare";
import GetAppIcon from "@mui/icons-material/GetApp";
import { usePWAInstall } from "../hooks/usePWAInstall";

export default function PWAInstallBanner() {
  const { isInstallable, isIOS, isDismissed, isInstalled, showInstallPrompt, dismiss } =
    usePWAInstall();

  const visible = (isInstallable || isIOS) && !isDismissed && !isInstalled;

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1300,
          borderTop: "1px solid",
          borderColor: "divider",
          borderRadius: 0,
          px: 2,
          py: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, maxWidth: 600, mx: "auto" }}>
          <GetAppIcon sx={{ color: "primary.main", flexShrink: 0 }} />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              Install XenDelta Hub
            </Typography>
            {isIOS ? (
              <Typography variant="caption" color="text.secondary">
                Tap <IosShareIcon sx={{ fontSize: 13, verticalAlign: "middle", mx: 0.25 }} /> then
                "Add to Home Screen"
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Add to your home screen for a faster experience
              </Typography>
            )}
          </Box>

          {!isIOS && (
            <Button
              variant="contained"
              size="small"
              onClick={showInstallPrompt}
              sx={{ flexShrink: 0 }}
            >
              Install
            </Button>
          )}

          <IconButton size="small" onClick={dismiss} aria-label="Dismiss install banner">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>
    </Slide>
  );
}
