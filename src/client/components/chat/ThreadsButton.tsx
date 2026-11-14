import { useMemo, useState } from "react";
import { Avatar, Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import { CHAT_THREAD_ARCHIVE_DAYS, type ChatPerson } from "@shared/chat";
import { plainMessageText } from "@shared/messageText";
import EmptyState from "../ui/EmptyState";
import { useThreads } from "../../hooks/chat/useThread";
import { isArchivedThread } from "../../utils/chatCache";
import { listTime, type PeopleLookup } from "../../routes/Internal/Messages/chatUi";

interface Props {
  conversationId: string;
  lookup: PeopleLookup;
  onOpen: (seq: number) => void;
}

/** A header button that lists the threads of this chat: active ones first, then those quiet for a week. */
export default function ThreadsButton({ conversationId, lookup, onOpen }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const threads = useThreads(conversationId, !!anchor);
  const sender = useMemo(() => {
    const extra = new Map<string, ChatPerson>((threads.data?.people ?? []).map((p) => [p._id, p]));
    return (id: string | null | undefined) => lookup(id) ?? (id ? extra.get(id) : undefined);
  }, [lookup, threads.data?.people]);
  const all = threads.data?.threads ?? [];
  const active = all.filter((m) => !isArchivedThread(m.thread?.lastAt, CHAT_THREAD_ARCHIVE_DAYS));
  const archived = all.filter((m) => isArchivedThread(m.thread?.lastAt, CHAT_THREAD_ARCHIVE_DAYS));

  const row = (m: (typeof all)[number]) => {
    const who = sender(m.from);
    return (
      <Box
        key={m._id}
        component="button"
        type="button"
        onClick={() => {
          setAnchor(null);
          onOpen(m.seq);
        }}
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
          px: 2,
          py: 1.25,
          cursor: "pointer",
          alignItems: "flex-start",
          "&:hover, &:focus-visible": { bgcolor: "action.hover" },
        }}
      >
        <Avatar src={who?.avatar || undefined} sx={{ width: 28, height: 28, fontSize: 13 }}>
          {who?.username[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {plainMessageText(m.body) || "Attachment"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {who?.username ?? "Former member"} · {m.thread?.count} {m.thread?.count === 1 ? "reply" : "replies"} · last{" "}
            {m.thread?.lastAt ? listTime(m.thread.lastAt) : ""}
          </Typography>
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Tooltip title="Threads">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Threads" aria-haspopup="dialog">
          <ForumOutlinedIcon />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Threads",
            sx: {
              width: { xs: "min(380px, calc(100vw - 16px))", sm: 380 },
              maxHeight: 460,
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 600 }}>Threads</Typography>
        </Box>
        <Box sx={{ overflowY: "auto" }}>
          {threads.isLoading ? (
            <Box sx={{ p: 3 }} aria-busy />
          ) : all.length === 0 ? (
            <EmptyState
              title="No threads yet"
              description="Reply in thread from a message's menu to start one."
              sx={{ py: 3 }}
            />
          ) : (
            <>
              {active.map(row)}
              {archived.length > 0 && (
                <>
                  <Typography variant="overline" color="text.secondary" sx={{ display: "block", px: 2, pt: 1.5 }}>
                    Archived, quiet for {CHAT_THREAD_ARCHIVE_DAYS} days
                  </Typography>
                  {archived.map(row)}
                </>
              )}
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}
