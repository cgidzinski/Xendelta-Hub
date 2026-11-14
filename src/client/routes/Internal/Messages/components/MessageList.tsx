import { useEffect, useMemo, useRef } from "react";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import type { ChatAttachment, ChatConversation } from "@shared/chat";
import type { LocalMessage } from "../../../../utils/chatCache";
import { dayLabel, systemText, type PeopleLookup } from "../chatUi";
import MessageBubble from "./MessageBubble";

interface MessageListProps {
  conversation: ChatConversation;
  /** Oldest first. */
  messages: LocalMessage[];
  lookup: PeopleLookup;
  meId: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  typingNames: string[];
  /** A community channel draws a flat row per message instead of bubbles. */
  layout?: "bubbles" | "flat";
  /** Whether the viewer may delete anyone's message (a community's manage messages); by default, a chat's owner may. */
  canModerate?: boolean;
  /** A sender's role label and colour, for a channel. */
  senderMeta?: (userId: string | null) => { color: string; role: string } | undefined;
  actions: {
    onReply: (m: LocalMessage) => void;
    onEdit: (m: LocalMessage) => void;
    onDelete: (m: LocalMessage) => void;
    onReact: (m: LocalMessage, emoji: string) => void;
    onRetry: (m: LocalMessage) => void;
    onDiscard: (m: LocalMessage) => void;
    onOpenAttachment: (m: LocalMessage, a: ChatAttachment) => void;
  };
}

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "system"; key: string; text: string }
  | { kind: "message"; key: string; message: LocalMessage; showSender: boolean; gap: boolean };

/**
 * The history. It is drawn newest-first in a column-reverse box, so it opens at the bottom, stays there as messages
 * arrive, and loading older ones at the top doesn't move what you are reading.
 */
export default function MessageList({
  conversation,
  messages,
  lookup,
  meId,
  hasMore,
  loadingMore,
  onLoadMore,
  typingNames,
  layout,
  canModerate,
  senderMeta,
  actions,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const isGroup = conversation.members.length > 2 || !!conversation.name;

  const bySeq = useMemo(() => new Map(messages.map((m) => [m.seq, m])), [messages]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prev: LocalMessage | undefined;
    let day = "";
    for (const m of messages) {
      const label = dayLabel(m.createdAt);
      if (label !== day) {
        out.push({ kind: "day", key: `day-${m.createdAt.slice(0, 10)}`, label });
        day = label;
        prev = undefined;
      }
      if (m.kind === "system") {
        out.push({ kind: "system", key: m._id, text: systemText(m, lookup, meId) });
        prev = undefined;
        continue;
      }
      const sameRun = !!prev && prev.from === m.from;
      out.push({ kind: "message", key: m._id, message: m, showSender: isGroup && !sameRun, gap: !sameRun });
      prev = m;
    }
    return out;
  }, [messages, lookup, meId, isGroup]);

  // The last message I sent that someone has read, and who has read it.
  const seen = useMemo(() => {
    const mine = [...messages].reverse().find((m) => m.from === meId && !m.status && !m.deletedAt);
    if (!mine) return undefined;
    const names = conversation.members
      .filter((x) => x.user_id !== meId && x.lastReadSeq >= mine.seq)
      .map((x) => lookup(x.user_id)?.username ?? "Someone");
    return { id: mine._id, names };
  }, [messages, conversation.members, meId, lookup]);

  // Load older messages when the top comes into view.
  useEffect(() => {
    const top = topRef.current;
    const root = scrollRef.current;
    if (!top || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore) onLoadMore();
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(top);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, rows.length]);

  const newestFirst = [...rows].reverse();

  return (
    <Box
      ref={scrollRef}
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column-reverse",
        px: { xs: 1.5, md: 3 },
        py: 2,
      }}
    >
      {typingNames.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }} aria-live="polite">
          {typingNames.length === 1 ? `${typingNames[0]} is typing…` : `${typingNames.join(", ")} are typing…`}
        </Typography>
      )}

      {newestFirst.map((row) => {
        if (row.kind === "day") {
          return (
            <Box key={row.key} sx={{ display: "flex", justifyContent: "center", my: 1.5 }}>
              <Chip size="small" variant="outlined" label={row.label} />
            </Box>
          );
        }
        if (row.kind === "system") {
          return (
            <Typography key={row.key} variant="caption" color="text.secondary" sx={{ textAlign: "center", my: 1 }}>
              {row.text}
            </Typography>
          );
        }
        const m = row.message;
        return (
          <Box key={row.key} sx={{ mt: row.gap ? 1.5 : 0.25 }}>
            <MessageBubble
              message={m}
              meId={meId}
              lookup={lookup}
              showSender={row.showSender}
              replyTarget={m.replyTo ? bySeq.get(m.replyTo) : undefined}
              seenBy={seen?.id === m._id ? seen.names : undefined}
              canDelete={
                m.from === meId ||
                (canModerate ?? conversation.members.find((x) => x.user_id === meId)?.role === "owner")
              }
              layout={layout}
              senderMeta={senderMeta?.(m.from)}
              {...actions}
            />
          </Box>
        );
      })}

      {hasMore && (
        <Box ref={topRef} sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          {loadingMore ? (
            <CircularProgress size={20} />
          ) : (
            <Button size="small" onClick={onLoadMore}>
              Load earlier messages
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
