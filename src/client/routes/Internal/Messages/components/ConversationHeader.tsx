import React from "react";
import { Box, Typography, IconButton, Toolbar } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleIcon from "@mui/icons-material/People";
import { useNavigate } from "react-router-dom";
import { Conversation } from "../../../types";

interface ConversationHeaderProps {
  conversation: Conversation;
  profileId?: string;
  onRemoveParticipant: (participantId: string) => void;
  getParticipantDisplay: (participantId: string) => string;
  onSettingsClick: () => void;
  onUsersClick: () => void;
}

export default function ConversationHeader({
  conversation,
  profileId,
  onRemoveParticipant,
  getParticipantDisplay,
  onSettingsClick,
  onUsersClick,
}: ConversationHeaderProps) {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        flexShrink: 0,
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        zIndex: 1,
      }}
    >
      <Toolbar>
        <IconButton edge="start" onClick={() => navigate("/internal/messages")} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="div">
            {conversation.name || conversation.participants
              .filter((p) => p !== profileId && p !== "system")
              .map((p) => getParticipantDisplay(p))
              .join(", ") || "Chat"}
          </Typography>
        </Box>
        <IconButton onClick={onUsersClick}>
          <PeopleIcon />
        </IconButton>
        <IconButton onClick={onSettingsClick}>
          <SettingsIcon />
        </IconButton>
      </Toolbar>
    </Box>
  );
}

