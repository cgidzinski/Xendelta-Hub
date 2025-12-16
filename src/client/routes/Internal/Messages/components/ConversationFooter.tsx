import React from "react";
import { Box, TextField, IconButton } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

interface ConversationFooterProps {
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onSendMessage: () => void;
  isSending: boolean;
}

export default function ConversationFooter({
  messageText,
  onMessageTextChange,
  onSendMessage,
  isSending,
}: ConversationFooterProps) {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <Box
      sx={{
        backgroundColor: "background.paper",
        borderTop: 1,
        borderColor: "divider",
        flexShrink: 0,
        zIndex: 1,
      }}
    >
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", p: 2 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => onMessageTextChange(e.target.value)}
          onKeyPress={handleKeyPress}
          variant="outlined"
          size="small"
        />
        <IconButton
          color="primary"
          onClick={onSendMessage}
          disabled={!messageText.trim() || isSending}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

