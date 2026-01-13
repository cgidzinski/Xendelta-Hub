import React from "react";
import { Box, Typography, Avatar, IconButton, Paper } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import { Message } from "../../../../types/Message";

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
    <Paper
      elevation={0}
      sx={{
        mb: 1.5,
        p: 1.5,
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
          sx={{ width: 48, height: 48, flexShrink: 0 }}
        >
          {getMessageSenderName(message).charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography variant="subtitle2" color={isMyMessage ? "primary" : "text.secondary"} fontWeight={600}>
              {getMessageSenderName(message)}
            </Typography>
            {showTimestamp && (
              <Typography variant="caption" color="text.secondary">
                {format(new Date(message.time), "h:mm a")}
              </Typography>
            )}
          </Box>
          <Typography variant="body1" sx={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
            {DOMPurify.sanitize(message.message, {
              ALLOWED_TAGS: [],
              ALLOWED_ATTR: [],
              KEEP_CONTENT: true,
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
          }}
        >
          <IconButton size="small" onClick={() => onMessageOptions(message)}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Paper>
  );
}
