import { useState } from "react";
import {
  Box,
  Button,
  Divider,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import {
  CUSTOM_STATUS_TEXT_MAX,
  PRESENCE_CHOICES,
  PRESENCE_LABELS,
  activeCustomStatus,
  type PresenceChoice,
  type PresenceStatus,
} from "@shared/presence";
import ResponsiveDialog from "../ui/ResponsiveDialog";
import EmojiPopover from "../emoji/EmojiPopover";
import { usePresence, useSetPresence } from "../../hooks/presence/usePresence";
import { PresenceDot } from "./PresenceDot";

const CHOICE_HINT: Record<PresenceChoice, string> = {
  online: "Show when you are around",
  idle: "Show as away",
  dnd: "Show as busy and silence push notifications",
  invisible: "Look offline to everyone",
};
const dotFor = (choice: PresenceChoice): PresenceStatus => (choice === "invisible" ? "offline" : choice);

const EXPIRY: Array<{ label: string; minutes: number | null }> = [
  { label: "Don't clear", minutes: null },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "Today", minutes: -1 },
];
const expiresAt = (minutes: number | null): string | null => {
  if (minutes === null) return null;
  if (minutes === -1) {
    const end = new Date();
    end.setHours(23, 59, 59, 0);
    return end.toISOString();
  }
  return new Date(Date.now() + minutes * 60_000).toISOString();
};

/** The row in the side menu that shows how you look to others, and opens the status picker. */
export default function StatusMenu() {
  const { me } = usePresence();
  const set = useSetPresence();
  const { enqueueSnackbar } = useSnackbar();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState(false);
  const choice = me?.choice ?? "online";
  const custom = activeCustomStatus(me?.customStatus);

  const choose = (next: PresenceChoice) => {
    setAnchor(null);
    set.mutate(
      { choice: next },
      { onError: () => enqueueSnackbar("Couldn't change your status", { variant: "error" }) },
    );
  };

  return (
    <>
      <ListItem disablePadding>
        <ListItemButton onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="menu" aria-label="Your status" dense>
          <Box sx={{ mr: 1.5, display: "flex" }}>
            <PresenceDot status={dotFor(choice)} size={12} />
          </Box>
          <ListItemText
            primary={custom ? `${custom.emoji} ${custom.text}`.trim() : PRESENCE_LABELS[choice]}
            secondary={custom ? PRESENCE_LABELS[choice] : undefined}
            slotProps={{ primary: { noWrap: true, variant: "body2" }, secondary: { variant: "caption" } }}
          />
        </ListItemButton>
      </ListItem>
      <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {PRESENCE_CHOICES.map((c) => (
          <MenuItem key={c} selected={c === choice} onClick={() => choose(c)}>
            <Box sx={{ mr: 1.5, display: "flex" }}>
              <PresenceDot status={dotFor(c)} size={12} />
            </Box>
            <Box>
              <Typography variant="body2">{PRESENCE_LABELS[c]}</Typography>
              <Typography variant="caption" color="text.secondary">
                {CHOICE_HINT[c]}
              </Typography>
            </Box>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setDialog(true);
          }}
        >
          {custom ? "Change your status line" : "Set a status line"}
        </MenuItem>
        {custom && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              set.mutate({ customStatus: null });
            }}
          >
            Clear your status line
          </MenuItem>
        )}
      </Menu>
      {dialog && <StatusLineDialog onClose={() => setDialog(false)} />}
    </>
  );
}

function StatusLineDialog({ onClose }: { onClose: () => void }) {
  const { me } = usePresence();
  const set = useSetPresence();
  const { enqueueSnackbar } = useSnackbar();
  const current = activeCustomStatus(me?.customStatus);
  const [text, setText] = useState(current?.text ?? "");
  const [emoji, setEmoji] = useState(current?.emoji ?? "");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);

  const save = () =>
    set.mutate(
      { customStatus: { text: text.trim(), emoji, expiresAt: expiresAt(minutes) } },
      {
        onSuccess: onClose,
        onError: (e: any) =>
          enqueueSnackbar(e?.response?.data?.message || "Couldn't save your status", { variant: "error" }),
      },
    );

  return (
    <ResponsiveDialog
      open
      title="Set a status line"
      onClose={onClose}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={set.isPending || (!text.trim() && !emoji)}>
            Save
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            aria-label="Pick an emoji"
            onClick={(e) => setPickerAnchor(e.currentTarget)}
            sx={{ minWidth: 48, fontSize: 20 }}
          >
            {emoji || "🙂"}
          </Button>
          <TextField
            fullWidth
            autoFocus
            label="What's up?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            slotProps={{ htmlInput: { maxLength: CUSTOM_STATUS_TEXT_MAX } }}
            onKeyDown={(e) => e.key === "Enter" && (text.trim() || emoji) && save()}
          />
        </Box>
        <TextField
          select
          label="Clear after"
          value={String(minutes)}
          onChange={(e) => setMinutes(e.target.value === "null" ? null : Number(e.target.value))}
        >
          {EXPIRY.map((x) => (
            <MenuItem key={x.label} value={String(x.minutes)}>
              {x.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <EmojiPopover anchorEl={pickerAnchor} onClose={() => setPickerAnchor(null)} onPick={setEmoji} placement="below" />
    </ResponsiveDialog>
  );
}
