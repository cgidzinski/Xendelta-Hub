import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import LockIcon from "@mui/icons-material/Lock";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";
import { formatDistance } from "date-fns";
import { Notification } from "../../hooks/user/useUserNotifications";

interface NotificationModalProps {
  notification: Notification | null;
  open: boolean;
  onClose: () => void;
}

const getNotificationIcon = (icon: string) => {
  switch (icon) {
    case "person":
      return <PersonIcon />;
    case "security":
      return <SecurityIcon />;
    case "announcement":
      return <AnnouncementIcon />;
    case "lock":
      return <LockIcon />;
    default:
      return <NotificationsIcon />;
  }
};

export default function NotificationModal({ notification, open, onClose }: NotificationModalProps) {
  const navigate = useNavigate();
  if (!notification) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          backgroundColor: "background.paper",
        },
      }}
    >
      <DialogTitle
        sx={{
          position: "relative",
          pr: 6,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: "primary.main",
              color: "primary.contrastText",
              "& .MuiSvgIcon-root": { fontSize: 20 },
            }}
          >
            {getNotificationIcon(notification.icon)}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              component="div"
              sx={{ fontWeight: notification.unread ? "bold" : "normal" }}
            >
              {notification.title}
            </Typography>
            {notification.unread && (
              <Typography variant="caption" color="primary.main">
                New notification
              </Typography>
            )}
          </Box>
        </Box>
        <Button
          aria-label="close"
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            minWidth: "auto",
            p: 1,
          }}
        >
          <CloseIcon />
        </Button>
      </DialogTitle>
      <DialogContent sx={{ m: 3 }}>
        <Typography
          variant="body1"
          sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7 }}
        >
          {notification.message}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          Received {formatDistance(new Date(notification.time), new Date(), { addSuffix: true })}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {notification.link && (
          <Button variant="contained" onClick={() => { navigate(notification.link!); onClose(); }}>
            Go to
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}