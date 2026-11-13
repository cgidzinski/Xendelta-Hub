import { useState } from "react";
import { Box, Button, Divider, ListItemIcon, Menu, MenuItem, TextField, Typography } from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import { format } from "date-fns";
import type { XenNote } from "../../../../types/XenNote";
import { formatReminder, reminderPresets } from "../reminders";

interface NoteReminderMenuProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  /** My reminder on this note, if I have one. */
  reminder: XenNote["reminder"];
  /** An ISO time to set the reminder for, or null to remove it. */
  onSet: (at: string | null) => void;
}

/** The quick choices for reminding me about a note, a date and time of my own, and removing it. */
export default function NoteReminderMenu({ anchor, onClose, reminder, onSet }: NoteReminderMenuProps) {
  const [custom, setCustom] = useState("");
  const now = new Date();
  const min = format(now, "yyyy-MM-dd'T'HH:mm");
  const when = custom ? new Date(custom) : null;
  const customValid = !!when && !Number.isNaN(when.getTime()) && when > now;

  const choose = (at: Date | null) => {
    onSet(at ? at.toISOString() : null);
    onClose();
  };

  return (
    <Menu open={!!anchor} anchorEl={anchor} onClose={onClose} slotProps={{ paper: { sx: { minWidth: 260 } } }}>
      <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 0.5, display: "block" }}>
        {reminder
          ? reminder.sent
            ? `You were reminded ${formatReminder(reminder.at)}`
            : `Reminding you ${formatReminder(reminder.at)}`
          : "Remind me about this note"}
      </Typography>
      {reminderPresets(now).map((p) => (
        <MenuItem key={p.label} onClick={() => choose(p.at)}>
          <ListItemIcon>
            <NotificationsNoneIcon fontSize="small" />
          </ListItemIcon>
          <Box sx={{ flex: 1 }}>{p.label}</Box>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            {formatReminder(p.at.toISOString(), now)}
          </Typography>
        </MenuItem>
      ))}
      <Divider />
      {/* Not a MenuItem: typing in it must not be taken as menu navigation. */}
      <Box sx={{ px: 2, py: 1, display: "flex", gap: 1, alignItems: "center" }} onKeyDown={(e) => e.stopPropagation()}>
        <TextField
          type="datetime-local"
          size="small"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Reminder date and time", min } }}
          sx={{ flex: 1 }}
        />
        <Button variant="outlined" size="small" disabled={!customValid} onClick={() => choose(when)}>
          Set
        </Button>
      </Box>
      {reminder && (
        <MenuItem onClick={() => choose(null)} sx={{ color: "error.main" }}>
          <ListItemIcon sx={{ color: "inherit" }}>
            <NotificationsOffOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Remove reminder
        </MenuItem>
      )}
    </Menu>
  );
}
