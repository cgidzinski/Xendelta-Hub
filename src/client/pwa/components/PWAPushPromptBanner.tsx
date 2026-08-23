import { Paper, Box, Typography, Button, IconButton, Slide } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { usePushPromptBanner } from "../hooks/usePushPromptBanner";

export default function PWAPushPromptBanner() {
  const { visible, isBusy, subscribe, dismiss } = usePushPromptBanner();

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
        </Box>
      </Paper>
    </Slide>
  );
}
