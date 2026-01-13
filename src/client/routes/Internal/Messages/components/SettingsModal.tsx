import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
} from "@mui/material";
import { Conversation } from "../../../../types/Conversation";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  onUpdateName: (name: string) => Promise<void>;
  isUpdating: boolean;
}

export default function SettingsModal({
  open,
  onClose,
  conversation,
  onUpdateName,
  isUpdating,
}: SettingsModalProps) {
  const [groupName, setGroupName] = useState("");
  const [muteNotifications, setMuteNotifications] = useState(false);
  const [pinConversation, setPinConversation] = useState(false);
  const [archiveConversation, setArchiveConversation] = useState(false);

  useEffect(() => {
    if (conversation) {
      setGroupName(conversation.name || "");
    }
  }, [conversation]);

  const handleSave = async () => {
    if (conversation) {
      await onUpdateName(groupName);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Conversation Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
          <TextField
            fullWidth
            label="Group Name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter group name..."
            variant="outlined"
          />

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Notification Settings
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={muteNotifications}
                  onChange={(e) => setMuteNotifications(e.target.checked)}
                />
              }
              label="Mute Notifications"
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Conversation Options
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={pinConversation}
                  onChange={(e) => setPinConversation(e.target.checked)}
                />
              }
              label="Pin Conversation"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={archiveConversation}
                  onChange={(e) => setArchiveConversation(e.target.checked)}
                />
              }
              label="Archive Conversation"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={isUpdating}>
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

