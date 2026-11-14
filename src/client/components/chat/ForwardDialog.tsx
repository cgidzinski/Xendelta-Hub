import { useMemo, useState } from "react";
import { Box, Button, Checkbox, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import { CHAT_MAX_FORWARD_TARGETS, chatTitle } from "@shared/chat";
import ResponsiveDialog from "../ui/ResponsiveDialog";
import EmptyState from "../ui/EmptyState";
import { useAuth } from "../../contexts/AuthContext";
import { useConversations } from "../../hooks/chat/useChat";
import { useChannels } from "../../hooks/communities/useCommunities";

interface Props {
  /** When forwarding from a community, its channels you can post in are offered too. */
  communityId?: string;
  busy?: boolean;
  onClose: () => void;
  onForward: (conversationIds: string[]) => void;
}

/** Pick up to a few chats (or channels) to send a copy of a message to. */
export default function ForwardDialog({ communityId, busy, onClose, onForward }: Props) {
  const { user } = useAuth();
  const conversations = useConversations().conversations;
  const channels = useChannels(communityId).data ?? [];
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const options = useMemo(
    () => [
      ...channels
        .filter((c) => c.permissions.includes("sendMessages"))
        .map((c) => ({ id: c._id, label: `#${c.name}` })),
      ...conversations.map((c) => ({ id: c._id, label: chatTitle(c, user.id) })),
    ],
    [channels, conversations, user.id],
  );
  const shown = options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (id: string) =>
    setPicked((all) =>
      all.includes(id) ? all.filter((x) => x !== id) : all.length < CHAT_MAX_FORWARD_TARGETS ? [...all, id] : all,
    );

  return (
    <ResponsiveDialog
      open
      title="Forward message"
      onClose={onClose}
      maxWidth="xs"
      actions={
        <>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {picked.length} of {CHAT_MAX_FORWARD_TARGETS} chosen
          </Typography>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={() => onForward(picked)} disabled={picked.length === 0 || busy}>
            Forward
          </Button>
        </>
      }
    >
      <Box sx={{ pt: 0.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Search chats" } }}
        />
        {shown.length === 0 ? (
          <EmptyState title="No chats found" sx={{ py: 3 }} />
        ) : (
          <List dense sx={{ maxHeight: 340, overflowY: "auto" }}>
            {shown.map((o) => (
              <ListItemButton
                key={o.id}
                onClick={() => toggle(o.id)}
                role="checkbox"
                aria-checked={picked.includes(o.id)}
              >
                <Checkbox edge="start" tabIndex={-1} disableRipple checked={picked.includes(o.id)} />
                <ListItemText primary={o.label} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </ResponsiveDialog>
  );
}
