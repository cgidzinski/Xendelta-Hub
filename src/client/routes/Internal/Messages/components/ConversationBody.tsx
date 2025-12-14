import React, { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { Message } from "../../../types";
import MessageBlock from "./MessageBlock";

interface ConversationBodyProps {
  messages: Message[];
  profileId?: string;
  getMessageSenderName: (message: Message) => string;
  isMyMessage: (message: Message) => boolean;
  shouldShowAvatar: (currentMessage: Message, previousMessage: Message | null) => boolean;
  shouldShowTimestamp: (currentMessage: Message, nextMessage: Message | null) => boolean;
  onMessageOptions: (message: Message) => void;
}

export default function ConversationBody({
  messages,
  profileId,
  getMessageSenderName,
  isMyMessage,
  shouldShowAvatar,
  shouldShowTimestamp,
  onMessageOptions,
}: ConversationBodyProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef(messages.length);

  // Check if user is near bottom of scroll
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 100; // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  // Handle scroll events
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      isUserScrollingRef.current = true;
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      // Reset flag after user stops scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const messageCountChanged = messages.length !== lastMessageCountRef.current;
    lastMessageCountRef.current = messages.length;

    // Only auto-scroll if:
    // 1. New message was added (count changed)
    // 2. User is not actively scrolling
    // 3. User is near the bottom (or it's the first load)
    if (messageCountChanged && !isUserScrollingRef.current && (isNearBottom() || messages.length === 1)) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [messages]);

  return (
    <Box
      ref={messagesContainerRef}
      sx={{
        flex: "1 1 auto",
        overflowY: "auto",
        overflowX: "hidden",
        p: 2,
        backgroundColor: "#1e1e1e",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: 0,
      }}
    >
      {messages.length === 0 ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No messages yet. Start the conversation!
          </Typography>
        </Box>
      ) : (
        messages.map((message, index) => {
          const previousMessage = index > 0 ? messages[index - 1] : null;
          const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
          const myMessage = isMyMessage(message);
          const showAvatar = shouldShowAvatar(message, previousMessage);
          const showTimestamp = shouldShowTimestamp(message, nextMessage);

          return (
              <MessageBlock
                key={message._id || `message-${index}`}
                message={message}
                previousMessage={previousMessage}
                nextMessage={nextMessage}
                isMyMessage={myMessage}
                showAvatar={showAvatar}
                showTimestamp={showTimestamp}
                getMessageSenderName={getMessageSenderName}
                onMessageOptions={onMessageOptions}
                profileId={profileId}
              />
          );
        })
      )}
      <div ref={messagesEndRef} />
    </Box>
  );
}

