import { useEffect, useState } from "react";
import { Avatar, Box, Button, Chip, IconButton, Menu, MenuItem, TextField, Typography } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import { useSnackbar } from "notistack";
import { CHAT_NAME_MAX, type ChatConversation } from "@shared/chat";
import { useChatActions } from "../../../../hooks/chat/useChat";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import SectionLabel from "../../../../components/ui/SectionLabel";
import UserName from "../../../../components/user/UserName";
import PersonLink from "../../../../components/user/PersonLink";

interface DetailsPanelProps {
  conversation: ChatConversation;
  meId: string;
  onAddPeople: () => void;
  /** Called after you leave, so the screen can move off the chat. */
  onLeft: () => void;
}

/** Name, members and your own settings for a chat. The owner can remove people and hand the chat over. */
export default function DetailsPanel({ conversation, meId, onAddPeople, onLeft }: DetailsPanelProps) {
  const { rename, removeMember, makeOwner, setMine } = useChatActions();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const [name, setName] = useState(conversation.name ?? "");
  const [menu, setMenu] = useState<{ el: HTMLElement; userId: string } | null>(null);
  const iAmOwner = conversation.members.find((m) => m.user_id === meId)?.role === "owner";

  useEffect(() => setName(conversation.name ?? ""), [conversation._id, conversation.name]);

  const fail = (e: any, fallback: string) =>
    enqueueSnackbar(e?.response?.data?.message || e?.message || fallback, { variant: "error" });

  const saveName = async () => {
    if (name.trim() === (conversation.name ?? "")) return;
    try {
      await rename.mutateAsync({ conversationId: conversation._id, name: name.trim() });
    } catch (e) {
      fail(e, "Couldn't rename the chat");
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: "Leave chat",
      message: "You won't get new messages from this chat. You can be added back by someone in it.",
      confirmLabel: "Leave",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeMember.mutateAsync({ conversationId: conversation._id, userId: meId });
      onLeft();
    } catch (e) {
      fail(e, "Couldn't leave the chat");
    }
  };

  const remove = async (userId: string) => {
    const person = conversation.people.find((p) => p._id === userId);
    const ok = await confirm({
      title: "Remove from chat",
      message: `${person?.username ?? "They"} will no longer be able to read this chat.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeMember.mutateAsync({ conversationId: conversation._id, userId });
    } catch (e) {
      fail(e, "Couldn't remove them");
    }
  };

  const handOver = async (userId: string) => {
    try {
      await makeOwner.mutateAsync({ conversationId: conversation._id, userId });
    } catch (e) {
      fail(e, "Couldn't hand the chat over");
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, p: 2.5, height: "100%", overflowY: "auto" }}>
      <Box>
        <SectionLabel>Name</SectionLabel>
        <TextField
          size="small"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="Add a name"
          slotProps={{ htmlInput: { maxLength: CHAT_NAME_MAX, "aria-label": "Chat name" } }}
          helperText="Leave empty to show members' names"
          sx={{ mt: 0.5 }}
        />
      </Box>

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>Members · {conversation.members.length}</SectionLabel>
          <Button size="small" onClick={onAddPeople}>
            Add people
          </Button>
        </Box>
        {conversation.members.map((m) => {
          const person = conversation.people.find((p) => p._id === m.user_id);
          const you = m.user_id === meId;
          return (
            <Box key={m.user_id} sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 0.75 }}>
              <Avatar src={person?.avatar || undefined} sx={{ width: 36, height: 36 }}>
                {person?.username[0]?.toUpperCase()}
              </Avatar>
              <Typography noWrap sx={{ flex: 1, minWidth: 0 }}>
                {person ? <PersonLink user={person} fallback="Former member" /> : <UserName fallback="Former member" />}
                {you ? " (you)" : ""}
              </Typography>
              {m.role === "owner" && <Chip size="small" variant="outlined" label="Owner" />}
              {iAmOwner && !you && (
                <IconButton
                  size="small"
                  aria-label={`Options for ${person?.username ?? "member"}`}
                  onClick={(e) => setMenu({ el: e.currentTarget, userId: m.user_id })}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          );
        })}
        {iAmOwner && (
          <Typography variant="caption" color="text.secondary">
            You&apos;re the owner: you can remove people or hand the chat over.
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: "auto" }}>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={conversation.muted ? <VolumeUpOutlinedIcon /> : <VolumeOffOutlinedIcon />}
          onClick={() => setMine.mutate({ conversationId: conversation._id, muted: !conversation.muted })}
        >
          {conversation.muted ? "Unmute notifications" : "Mute notifications"}
        </Button>
        <Button variant="outlined" color="error" onClick={leave}>
          Leave chat
        </Button>
      </Box>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menu) void handOver(menu.userId);
            setMenu(null);
          }}
        >
          Make owner
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            if (menu) void remove(menu.userId);
            setMenu(null);
          }}
        >
          Remove from chat
        </MenuItem>
      </Menu>
    </Box>
  );
}
