import { Box, Typography, ListItem } from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import MailIcon from "@mui/icons-material/Mail";
import PersonIcon from "@mui/icons-material/Person";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import SecurityIcon from "@mui/icons-material/Security";
import LockIcon from "@mui/icons-material/Lock";
import { formatDistance } from "date-fns";
import { InboxItem as InboxItemType, NotificationInboxItem, ConversationInboxItem } from "../../types/InboxItem";
import StackedAvatars from "../../routes/Internal/Messages/components/StackedAvatars";

interface InboxItemProps {
  item: InboxItemType;
  onClick: (item: InboxItemType) => void;
  onHover?: (item: InboxItemType) => void;
}

const getNotificationIcon = (icon: string) => {
  switch (icon) {
    case "person":
      return <PersonIcon />;
    case "security":
      return <SecurityIcon />;
    case "announcement":
      return <AnnouncementIcon />;
    case "mail":
      return <MailIcon />;
    case "lock":
      return <LockIcon />;
    default:
      return <NotificationsIcon />;
  }
};

export default function InboxItem({ item, onClick, onHover }: InboxItemProps) {
  const isNotification = item.type === "notification";
  const notificationData = isNotification ? (item as NotificationInboxItem) : null;
  const conversationData = !isNotification ? (item as ConversationInboxItem) : null;

  return (
    <ListItem
      onClick={() => onClick(item)}
      onMouseEnter={() => onHover?.(item)}
      sx={{
        flexDirection: "column",
        alignItems: "flex-start",
        py: 1.5,
        px: 2,
        cursor: "pointer",
        "&:hover": { backgroundColor: "action.hover" },
        backgroundColor: item.unread ? "transparent" : "background.default",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 0.5 }}>
        <Box sx={{ mr: 1.5, color: "primary.main", display: "flex", alignItems: "center" }}>
          {isNotification ? (
            getNotificationIcon(notificationData?.icon || "announcement")
          ) : (
            <MailIcon />
          )}
        </Box>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: item.unread ? "bold" : "normal", flexGrow: 1 }}
        >
          {item.title}
        </Typography>
        {!isNotification && conversationData?.participantInfo && (
          <StackedAvatars
            participants={conversationData.participantInfo.map(p => ({ username: p.username }))}
            maxAvatars={3}
            size={24}
          />
        )}
      </Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ ml: 4, mb: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "340px" }}
      >
        {item.preview}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
        {formatDistance(new Date(item.time), new Date(), { addSuffix: true })}
      </Typography>
    </ListItem>
  );
}