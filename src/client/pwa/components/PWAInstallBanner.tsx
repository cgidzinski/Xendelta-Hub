import { Box, Typography, Button, IconButton, Slide } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import IosShareIcon from "@mui/icons-material/IosShare";
import GetAppIcon from "@mui/icons-material/GetApp";
import Banner from "../../components/ui/Banner";
import { usePWAInstall } from "../hooks/usePWAInstall";

export default function PWAInstallBanner() {
  const { isInstallable, isIOS, isDismissed, isInstalled, showInstallPrompt, dismiss } = usePWAInstall();

  const visible = (isInstallable || isIOS) && !isDismissed && !isInstalled;

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Banner zIndex={1300}>
        <GetAppIcon sx={{ color: "primary.main", flexShrink: 0 }} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            Install XenDelta Hub
          </Typography>
          {isIOS ? (
            <Typography variant="caption" color="text.secondary">
              Tap <IosShareIcon sx={{ fontSize: 13, verticalAlign: "middle", mx: 0.25 }} /> then "Add to Home Screen"
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Add to your home screen for a faster experience
            </Typography>
          )}
        </Box>

        {!isIOS && (
          <Button variant="contained" size="small" onClick={showInstallPrompt} sx={{ flexShrink: 0 }}>
            Install
          </Button>
        )}

        <IconButton size="small" onClick={dismiss} aria-label="Dismiss install banner">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Banner>
    </Slide>
  );
}
