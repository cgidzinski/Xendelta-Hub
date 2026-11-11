import { Box, Typography, Button, IconButton, Slide } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import Banner from "../../components/ui/Banner";
import { usePushPromptBanner } from "../hooks/usePushPromptBanner";

export default function PWAPushPromptBanner() {
  const { visible, isBusy, subscribe, dismiss } = usePushPromptBanner();

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Banner zIndex={1300}>
        <NotificationsActiveIcon sx={{ color: "primary.main", flexShrink: 0 }} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            Turn on notifications
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Get alerts for expenses and activity, even when the app is closed
          </Typography>
        </Box>

        <Button variant="contained" size="small" onClick={subscribe} disabled={isBusy} sx={{ flexShrink: 0 }}>
          Enable
        </Button>

        <IconButton size="small" onClick={dismiss} aria-label="Dismiss notification prompt">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Banner>
    </Slide>
  );
}
