import React from "react";
import { Box, Typography, Avatar, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
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
  onDeleteMessage: (messageId: string) => void;
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
  onDeleteMessage,
  profileId,
}: MessageBlockProps) {
  const [avatarError, setAvatarError] = React.useState(false);
  const isSystemMessage = message.isSystemMessage || message.from === "system";
  const avatarSrc = !isSystemMessage && message.from ? `/avatar/${message.from}` : undefined;

  // Determine spacing based on message grouping (same sender, close time)
  const isGroupedWithNext = nextMessage && 
    nextMessage.from === message.from && 
    new Date(nextMessage.time).getTime() - new Date(message.time).getTime() < 5 * 60 * 1000;
  
  const isGroupedWithPrevious = previousMessage && 
    previousMessage.from === message.from && 
    new Date(message.time).getTime() - new Date(previousMessage.time).getTime() < 5 * 60 * 1000;

  return (
    <Box
      sx={{
        width: "100%",
        mb: isGroupedWithNext ? 0.5 : 1.5,
        mt: isGroupedWithPrevious && !showAvatar ? 0.25 : 0,
        border: "2px solid",
        borderColor: "purple",
        borderRadius: 2,
        p: 1,
        backgroundColor: isMyMessage ? "primary.main" : "background.paper",
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
            <Typography variant="subtitle2" sx={{ color: isMyMessage ? "primary.contrastText" : "text.secondary", opacity: 0.9, fontWeight: 600 }}>
              {getMessageSenderName(message)}
            </Typography>
            <Typography variant="caption" sx={{ color: isMyMessage ? "primary.contrastText" : "text.secondary", opacity: 0.7 }}>
              - {format(new Date(message.time), "h:mm a")}
            </Typography>
          </Box>
          <Typography
            variant="body1"
            sx={{
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              color: isMyMessage ? "primary.contrastText" : "text.primary",
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
            onClick={() => onDeleteMessage(message._id)}
            sx={{
              backgroundColor: "background.paper",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

