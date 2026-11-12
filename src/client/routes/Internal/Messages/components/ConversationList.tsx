import { useMemo, useState } from "react";
import { Badge, Box, Button, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { chatTitle, type ChatConversation } from "@shared/chat";
import { useAuth } from "../../../../contexts/AuthContext";
import { useConversations } from "../../../../hooks/chat/useChat";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import EmptyState from "../../../../components/ui/EmptyState";
import ChatAvatar from "./ChatAvatar";
import { listTime } from "../chatUi";

interface ConversationListProps {
  selectedId?: string;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
}

function Row({
  chat,
  selected,
  meId,
  onSelect,
}: {
  chat: ChatConversation;
  selected: boolean;
  meId: string;
  onSelect: () => void;
}) {
  const unread = chat.unread > 0 && !chat.muted;
  const fromMe = chat.lastMessage?.from === meId;
  const sender = chat.lastMessage?.from ? chat.people.find((p) => p._id === chat.lastMessage?.from) : undefined;
  const group = chat.people.length > 2 || !!chat.name;
  const prefix = fromMe ? "You: " : group && sender ? `${sender.username}: ` : "";

  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        width: "100%",
        px: 1.5,
        py: 1.25,
        border: 0,
        borderRadius: 2,
        textAlign: "left",
        font: "inherit",
        color: "text.primary",
        cursor: "pointer",
        bgcolor: selected ? "action.selected" : "transparent",
        "&:hover": { bgcolor: selected ? "action.selected" : "action.hover" },
      }}
    >
      <ChatAvatar conversation={chat} meId={meId} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: unread ? 600 : 500 }}>
            {chatTitle(chat, meId)}
          </Typography>
          {chat.lastMessage && (
            <Typography variant="caption" color={unread ? "primary.main" : "text.secondary"}>
              {listTime(chat.lastMessage.at)}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
          <Typography
            variant="body2"
            noWrap
            color={unread ? "text.primary" : "text.secondary"}
            sx={{ flex: 1, minWidth: 0 }}
          >
            {chat.lastMessage ? `${prefix}${chat.lastMessage.preview}` : "No messages yet"}
          </Typography>
          {chat.muted && <VolumeOffIcon aria-label="Muted" sx={{ fontSize: 16, color: "text.disabled" }} />}
          {unread && (
            <Badge
              badgeContent={chat.unread > 99 ? "99+" : chat.unread}
              color="primary"
              sx={{ "& .MuiBadge-badge": { position: "static", transform: "none" } }}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** The conversations, newest activity first, with a search over the loaded ones and a "new chat" button. */
export default function ConversationList({ selectedId, onSelect, onNewChat }: ConversationListProps) {
  const { user } = useAuth();
  const { conversations, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useConversations();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter((c) => chatTitle(c, user.id).toLowerCase().includes(q)) : conversations;
  }, [conversations, query, user.id]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, pt: 2, pb: 1 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Messages
        </Typography>
        <Tooltip title="New chat">
          <IconButton
            onClick={onNewChat}
            aria-label="New chat"
            sx={{ border: 1, borderColor: "divider", borderRadius: 1.5 }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            htmlInput: { "aria-label": "Search chats" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1, pb: 1 }}>
        {isLoading ? (
          <Box sx={{ p: 1 }}>
            <ListSkeleton rows={6} height={64} gap={1} />
          </Box>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<ChatBubbleOutlineIcon />}
            title={query ? "No chats match" : "No messages yet"}
            description={query ? undefined : "Start a chat with someone."}
            action={
              query ? undefined : (
                <Button variant="contained" onClick={onNewChat}>
                  New chat
                </Button>
              )
            }
            sx={{ py: 4 }}
          />
        ) : (
          shown.map((chat) => (
            <Row
              key={chat._id}
              chat={chat}
              meId={user.id}
              selected={chat._id === selectedId}
              onSelect={() => onSelect(chat._id)}
            />
          ))
        )}
        {hasNextPage && !query && (
          <Box sx={{ textAlign: "center", py: 1 }}>
            <Button size="small" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Loading..." : "Show older chats"}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
