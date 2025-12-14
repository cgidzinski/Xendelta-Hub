import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Box,
  Typography,
  Divider,
  TextField,
} from "@mui/material";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { Conversation } from "../../../types";

interface UsersModalProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  profileId?: string;
  getParticipantDisplay: (participantId: string) => string;
  onLeave: () => Promise<void>;
  isLeaving: boolean;
  onAddParticipant: (participantIds: string[]) => void;
  isAddingParticipants: boolean;
}

export default function UsersModal({
  open,
  onClose,
  conversation,
  profileId,
  getParticipantDisplay,
  onLeave,
  isLeaving,
  onAddParticipant,
  isAddingParticipants,
}: UsersModalProps) {
  const [showAddUser, setShowAddUser] = useState(false);
  const [newParticipantIds, setNewParticipantIds] = useState("");

  const handleLeave = async () => {
    await onLeave();
    onClose();
  };

  const handleAddUser = () => {
    if (!newParticipantIds.trim()) return;
    const participantIds = newParticipantIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (participantIds.length > 0) {
      onAddParticipant(participantIds);
      setNewParticipantIds("");
      setShowAddUser(false);
    }
  };

  if (!conversation) return null;

  // Get real participants (excluding system)
  const realParticipants = conversation.participants.filter((p) => p !== "system");
  const isLastUser = realParticipants.length === 1 && realParticipants[0] === profileId;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Participants</DialogTitle>
      <DialogContent>
        <List>
          {conversation.participants.map((participantId) => {
            if (participantId === "system") return null;
            const isCurrentUser = participantId === profileId;
            return (
              <React.Fragment key={participantId}>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar 
                      src={`/avatar/${participantId}`}
                      sx={{ borderRadius: 1.5 }}
                    >
                      {getParticipantDisplay(participantId).charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={getParticipantDisplay(participantId)}
                    secondary={isCurrentUser ? "You" : undefined}
                  />
                </ListItem>
                <Divider />
              </React.Fragment>
            );
          })}
        </List>

        {conversation.canReply !== false && showAddUser && (
          <Box sx={{ mt: 2, p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Add Participants
            </Typography>
            <TextField
              fullWidth
              label="User IDs (comma-separated)"
              placeholder="user1, user2, user3"
              value={newParticipantIds}
              onChange={(e) => setNewParticipantIds(e.target.value)}
              size="small"
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                onClick={handleAddUser}
                disabled={isAddingParticipants || !newParticipantIds.trim()}
                size="small"
              >
                {isAddingParticipants ? "Adding..." : "Add"}
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setShowAddUser(false);
                  setNewParticipantIds("");
                }}
                size="small"
              >
                Cancel
              </Button>
            </Box>
          </Box>
        )}

        {conversation.canReply !== false && !showAddUser && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              startIcon={<PersonAddIcon />}
              onClick={() => setShowAddUser(true)}
              fullWidth
            >
              Add User
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          onClick={handleLeave}
          variant="contained"
          color="error"
          startIcon={<ExitToAppIcon />}
          disabled={isLeaving}
        >
          {isLeaving
            ? "Leaving..."
            : isLastUser
            ? "Delete Conversation"
            : "Leave Conversation"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

