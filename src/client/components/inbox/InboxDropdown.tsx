import { useState, useRef } from "react";
import {
  Box,
  Menu,
  Typography,
  Button,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PersonIcon from "@mui/icons-material/Person";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import SecurityIcon from "@mui/icons-material/Security";
import LockIcon from "@mui/icons-material/Lock";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { formatDistance } from "date-fns";
import { useNavigate } from "react-router-dom";
import { InboxItem as InboxItemType, NotificationInboxItem } from "../../types/InboxItem";
import LoadingSpinner from "../LoadingSpinner";
import InboxItem from "./InboxItem";

interface InboxDropdownProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  items: InboxItemType[];
  isLoading: boolean;
  isFetching: boolean;
  onMarkAsRead: (item: InboxItemType) => void;
  onRefetch: () => void;
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

export default function InboxDropdown({
  anchorEl,
  onClose,
  items,
  isLoading,
  isFetching,
  onMarkAsRead,
  onRefetch,
}: InboxDropdownProps) {
  const navigate = useNavigate();
  const markedRef = useRef<Set<string>>(new Set());
  const [selectedNotification, setSelectedNotification] = useState<NotificationInboxItem | null>(null);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);

  const notifications = items.filter(item => item.type === "notification");
  const conversations = items.filter(item => item.type === "conversation");

  const handleItemClick = (item: InboxItemType) => {
    if (item.type === "notification") {
      setSelectedNotification(item as NotificationInboxItem);
      setNotificationModalOpen(true);
    } else {
      navigate(`/internal/messages/${item.id}`);
      handleClose();
    }
    if (item.unread) {
      markedRef.current.add(item.id);
      onMarkAsRead(item);
    }
  };

  const handleItemHover = (item: InboxItemType) => {
    if (item.unread && !markedRef.current.has(item.id)) {
      markedRef.current.add(item.id);
      onMarkAsRead(item);
    }
  };

  const handleClose = () => {
    markedRef.current.clear();
    onClose();
  };

  const handleCloseNotificationModal = () => {
    setNotificationModalOpen(false);
    setSelectedNotification(null);
  };

  const handleGoToMessages = () => {
    navigate("/internal/messages");
    handleClose();
  };

  return (
    <>
      <Menu
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { width: 400, maxHeight: 500, mt: 1 },
          },
        }}
      >
        <Box sx={{ pt: 1 }}>
          {/* Header with Go To Messages */}
          <Box sx={{ px: 2, pb: 1.5 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleGoToMessages}
              sx={{ textTransform: "none" }}
            >
              Go To Messages
            </Button>
          </Box>

          {/* Notifications Section */}
          <Box sx={{ pt: 1 }}>
            <Typography
              variant="overline"
              sx={{ px: 2, color: "text.secondary", fontWeight: "bold" }}
            >
              Notifications
            </Typography>
            <Divider sx={{ my: 0.5 }} />

            {isFetching && items.length === 0 ? (
              <Box sx={{ py: 3 }}>
                <LoadingSpinner />
              </Box>
            ) : notifications.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                No notifications
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 200, overflow: "auto" }}>
                {notifications.map((item, index) => (
                  <Box key={item.id}>
                    <InboxItem
                      item={item}
                      onClick={handleItemClick}
                      onHover={handleItemHover}
                    />
                    {index < notifications.length - 1 && <Divider variant="fullWidth" />}
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Conversations Section */}
          <Box sx={{ pt: 1 }}>
            <Typography
              variant="overline"
              sx={{ px: 2, color: "text.secondary", fontWeight: "bold" }}
            >
              Conversations
            </Typography>
            <Divider sx={{ my: 0.5 }} />

            {conversations.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                No conversations
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 200, overflow: "auto" }}>
                {conversations.map((item, index) => (
                  <Box key={item.id}>
                    <InboxItem
                      item={item}
                      onClick={handleItemClick}
                      onHover={handleItemHover}
                    />
                    {index < conversations.length - 1 && <Divider variant="fullWidth" />}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Menu>

      {/* Notification Detail Modal */}
      <Dialog
        open={notificationModalOpen}
        onClose={handleCloseNotificationModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        {selectedNotification && (
          <>
            <DialogTitle sx={{ position: "relative", pr: 5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ color: "primary.main", display: "flex", alignItems: "center" }}>
                  {getNotificationIcon(selectedNotification.icon)}
                </Box>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  {selectedNotification.title}
                </Typography>
              </Box>
              <IconButton
                aria-label="close"
                onClick={handleCloseNotificationModal}
                sx={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {selectedNotification.preview}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatDistance(new Date(selectedNotification.time), new Date(), { addSuffix: true })}
              </Typography>
            </DialogContent>
          </>
        )}
      </Dialog>
    </>
  );
}