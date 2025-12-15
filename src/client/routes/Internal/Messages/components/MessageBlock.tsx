import React from "react";
import { Box, Typography, Avatar, IconButton } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import { Message } from "../../../types";

interface MessageBlockProps {
  message: Message;
  previousMessage: Message | null;
  nextMessage: Message | null;
  isMyMessage: boolean;
  showAvatar: boolean;
  showTimestamp: boolean;
  getMessageSenderName: (message: Message) => string;
  getMessageSenderAvatar?: (message: Message) => string | undefined;
  onMessageOptions: (message: Message) => void;
  profileId?: string;
}

export default function MessageBlock({
  message,
  previousMessage,
  nextMessage,
  isMyMessage,
  showAvatar,
  showTimestamp,
  getMessageSenderName,
  getMessageSenderAvatar,
  onMessageOptions,
  profileId,
}: MessageBlockProps) {
  const [avatarError, setAvatarError] = React.useState(false);
  const isSystemMessage = message.isSystemMessage || message.from === "system";
  const avatarSrc = !isSystemMessage && getMessageSenderAvatar 
    ? getMessageSenderAvatar(message)
    : undefined;

  return (
    <Box
      sx={{
        width: "100%",
        mb: 1.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        p: 1.5,
        backgroundColor: "background.paper",
        position: "relative",
        "&:hover .message-actions": {
          opacity: 1,
        },
      }}
    >
      <Box sx={{ display: "flex", gap: 1, alignItems: showAvatar ? "center" : "flex-start" }}>
        <Avatar
          src={!avatarError && avatarSrc ? `${avatarSrc}?t=${new Date(message.time).getTime()}` : undefined}
          onError={() => setAvatarError(true)}
          sx={{ width: 48, height: 48, flexShrink: 0, borderRadius: 2 }}
        >
          {getMessageSenderName(message).charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography variant="subtitle2" sx={{ color: isMyMessage ? "primary.main" : "text.secondary", opacity: 0.9, fontWeight: 600 }}>
              {getMessageSenderName(message)}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.7 }}>
              - {format(new Date(message.time), "h:mm a")}
            </Typography>
          </Box>
          <Typography
            variant="body1"
            sx={{
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              color: "text.primary",
            }}
          >
            {DOMPurify.sanitize(message.message, {
              ALLOWED_TAGS: [], // No HTML tags allowed, only plain text
              ALLOWED_ATTR: [],
              KEEP_CONTENT: true, // Keep text content but strip HTML
            })}
          </Typography>
        </Box>
      </Box>
      {message.from === profileId && (
        <Box
          className="message-actions"
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            opacity: 0,
            transition: "opacity 0.2s",
            display: "flex",
            gap: 0.5,
          }}
        >
          <IconButton
            size="small"
            onClick={() => onMessageOptions(message)}
            sx={{
              backgroundColor: "background.paper",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

