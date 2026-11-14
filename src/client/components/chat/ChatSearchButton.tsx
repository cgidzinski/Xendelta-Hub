import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import { useNavigate } from "react-router-dom";
import { chatTitle, type ChatPerson, type ChatSearchHas, type ChatSearchResult } from "@shared/chat";
import { plainMessageText } from "@shared/messageText";
import EmptyState from "../ui/EmptyState";
import ResponsiveDialog from "../ui/ResponsiveDialog";
import { useAuth } from "../../contexts/AuthContext";
import { useChatSearch, useConversations } from "../../hooks/chat/useChat";
import { dayLabel, clock, type PeopleLookup } from "../../routes/Internal/Messages/chatUi";

type Scope = "chat" | "community" | "all";

interface Props {
  /** The chat the button sits in. */
  conversationId: string;
  /** Set for a channel: searching "this community" is then offered. */
  communityId?: string;
  /** What to call the chat in the "This ..." choice. */
  scopeNoun: string;
  /** Who can be picked as the sender. */
  people: ChatPerson[];
  lookup: PeopleLookup;
}

/** Split `text` around the search words so they can be marked. Words of one letter are left alone. */
export function highlightParts(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1),
    ),
  ];
  if (words.length === 0) return [{ text, hit: false }];
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}

/** A header button that opens message search: words, a person, a kind of message and dates, in this chat or wider. */
export default function ChatSearchButton({ conversationId, communityId, scopeNoun, people, lookup }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="Search messages">
        <IconButton onClick={() => setOpen(true)} aria-label="Search messages" aria-haspopup="dialog">
          <SearchIcon />
        </IconButton>
      </Tooltip>
      {open && (
        <SearchDialog
          conversationId={conversationId}
          communityId={communityId}
          scopeNoun={scopeNoun}
          people={people}
          lookup={lookup}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SearchDialog({
  conversationId,
  communityId,
  scopeNoun,
  people,
  lookup,
  onClose,
}: Props & { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const conversations = useConversations();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("chat");
  const [from, setFrom] = useState("");
  const [has, setHas] = useState<"" | ChatSearchHas>("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");

  // Wait for a pause in typing before asking.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  // A day picked in the box means the whole day: from its start, up to the start of the next.
  const params = useMemo(
    () => ({
      q,
      ...(scope === "chat" ? { conversationId } : {}),
      ...(scope === "community" && communityId ? { communityId } : {}),
      ...(from ? { from } : {}),
      ...(has ? { has } : {}),
      ...(after ? { after: new Date(`${after}T00:00:00`).toISOString() } : {}),
      ...(before ? { before: new Date(new Date(`${before}T00:00:00`).getTime() + 86_400_000).toISOString() } : {}),
    }),
    [q, scope, conversationId, communityId, from, has, after, before],
  );
  const search = useChatSearch(params, true);
  const results = search.data?.pages.flatMap((p) => p.results) ?? [];
  const extraPeople = useMemo(
    () => new Map((search.data?.pages.flatMap((p) => p.people) ?? []).map((p) => [p._id, p])),
    [search.data],
  );
  const searching = q.length > 0 || !!from || !!has;

  const whereOf = (r: ChatSearchResult) => {
    if (r.channelName) return `#${r.channelName}`;
    const chat = conversations.conversations.find((c) => c._id === r.message.conversationId);
    return chat ? chatTitle(chat, user.id) : "A chat";
  };
  const openResult = (r: ChatSearchResult) => {
    const path = r.communityId
      ? `/internal/communities/${r.communityId}/${r.message.conversationId}`
      : `/internal/messages/${r.message.conversationId}`;
    onClose();
    navigate(`${path}?seq=${r.message.seq}`);
  };

  return (
    <ResponsiveDialog open title="Search messages" onClose={onClose} maxWidth="sm">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 0.5 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search messages"
          value={text}
          onChange={(e) => setText(e.target.value)}
          slotProps={{
            htmlInput: { "aria-label": "Search words", maxLength: 100 },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={scope}
          onChange={(_e, v: Scope | null) => v && setScope(v)}
          aria-label="Where to search"
        >
          <ToggleButton value="chat">This {scopeNoun}</ToggleButton>
          {communityId && <ToggleButton value="community">This community</ToggleButton>}
          <ToggleButton value="all">Everywhere</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 1 }}>
          <TextField select size="small" label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
            <MenuItem value="">Anyone</MenuItem>
            {people.map((p) => (
              <MenuItem key={p._id} value={p._id}>
                {p.username}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Has"
            value={has}
            onChange={(e) => setHas(e.target.value as "" | ChatSearchHas)}
          >
            <MenuItem value="">Anything</MenuItem>
            <MenuItem value="attachment">A file</MenuItem>
            <MenuItem value="link">A link</MenuItem>
          </TextField>
          <TextField
            size="small"
            type="date"
            label="After"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type="date"
            label="Before"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>

        <Box aria-live="polite" sx={{ minHeight: 120 }}>
          {!searching ? (
            <EmptyState
              icon={<SearchIcon />}
              title="Search your messages"
              description="Type some words, or pick a person or a kind of message."
              sx={{ py: 3 }}
            />
          ) : search.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} aria-label="Searching" />
            </Box>
          ) : search.isError ? (
            <EmptyState title="Couldn't search" description="Try again in a moment." sx={{ py: 3 }} />
          ) : results.length === 0 ? (
            <EmptyState
              title="No messages found"
              description="Try different words, or search everywhere."
              sx={{ py: 3 }}
            />
          ) : (
            <>
              {results.map((r) => {
                const who = lookup(r.message.from) ?? (r.message.from ? extraPeople.get(r.message.from) : undefined);
                const body = plainMessageText(r.message.body) || "Attachment";
                return (
                  <Box
                    key={r.message._id}
                    component="button"
                    type="button"
                    onClick={() => openResult(r)}
                    aria-label={`Open message from ${who?.username ?? "a former member"}`}
                    sx={{
                      display: "flex",
                      gap: 1.25,
                      width: "100%",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                      bgcolor: "transparent",
                      border: 0,
                      borderBottom: 1,
                      borderColor: "divider",
                      px: 1,
                      py: 1.25,
                      cursor: "pointer",
                      alignItems: "flex-start",
                      "&:hover, &:focus-visible": { bgcolor: (t) => alpha(t.palette.primary.main, 0.08) },
                    }}
                  >
                    <Avatar src={who?.avatar || undefined} sx={{ width: 30, height: 30, fontSize: 13 }}>
                      {who?.username[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        <b>{who?.username ?? "Former member"}</b> · {whereOf(r)} · {dayLabel(r.message.createdAt)},{" "}
                        {clock(r.message.createdAt)}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          wordBreak: "break-word",
                        }}
                      >
                        {highlightParts(body, q).map((part, i) =>
                          part.hit ? (
                            <Box
                              key={i}
                              component="mark"
                              sx={{
                                bgcolor: (t) => alpha(t.palette.warning.main, 0.35),
                                color: "inherit",
                                borderRadius: 0.5,
                              }}
                            >
                              {part.text}
                            </Box>
                          ) : (
                            part.text
                          ),
                        )}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
              {search.hasNextPage && (
                <Box sx={{ display: "flex", justifyContent: "center", pt: 1.5 }}>
                  <Button onClick={() => search.fetchNextPage()} disabled={search.isFetchingNextPage}>
                    Show more
                  </Button>
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>
    </ResponsiveDialog>
  );
}
