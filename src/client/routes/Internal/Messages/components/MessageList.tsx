import { useEffect, useMemo, useRef, useState } from "react";
import { alpha } from "@mui/material/styles";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { CustomEmoji } from "@shared/emoji";
import { Box, Button, Chip, CircularProgress, Fab, Typography } from "@mui/material";
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
  /** The custom emoji of this community or chat. */
  customEmoji?: CustomEmoji[];
  /** May this person pin and unpin here? */
  canPin?: boolean;
  /** A community channel draws a flat row per message instead of bubbles. */
  layout?: "bubbles" | "flat";
  /** Whether the viewer may delete anyone's message (a community's manage messages); by default, a chat's owner may. */
  canModerate?: boolean;
  /** A sender's role label and colour, for a channel. */
  senderMeta?: (userId: string | null) => { color: string; role: string } | undefined;
  /** Scroll this message into view and mark it for a moment. `token` changes for every jump, so jumping twice to one message works. */
  focus?: { seq: number; token: number } | null;
  /** Where "new messages" begins: the divider goes above this message. */
  unreadFromSeq?: number;
  /** What is shown is a window around a message, not the live end: the button goes back to the present. */
  windowMode?: boolean;
  onJumpToPresent: () => void;
  actions: {
    onReply: (m: LocalMessage) => void;
    onEdit: (m: LocalMessage) => void;
    onDelete: (m: LocalMessage) => void;
    onReact: (m: LocalMessage, emoji: string) => void;
    onRemoveEmbeds: (m: LocalMessage) => void;
    onPin: (m: LocalMessage, on: boolean) => void;
    onJumpTo: (seq: number) => void;
    onCopyLink: (m: LocalMessage) => void;
    onOpenThread: (m: LocalMessage) => void;
    onVote: (m: LocalMessage, optionIds: string[]) => void;
    onClosePoll: (m: LocalMessage) => void;
    onForward: (m: LocalMessage) => void;
    onRetry: (m: LocalMessage) => void;
    onDiscard: (m: LocalMessage) => void;
    onOpenAttachment: (m: LocalMessage, a: ChatAttachment) => void;
    onAttachmentUrl: (m: LocalMessage, a: ChatAttachment) => Promise<string>;
  };
}

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "system"; key: string; text: string }
  | { kind: "unread"; key: string }
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
  customEmoji,
  canPin,
  layout,
  canModerate,
  senderMeta,
  focus,
  unreadFromSeq,
  windowMode,
  onJumpToPresent,
  actions,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const isGroup = conversation.members.length > 2 || !!conversation.name;

  const customById = useMemo(() => new Map((customEmoji ?? []).map((e) => [e._id, e])), [customEmoji]);
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
      if (unreadFromSeq !== undefined && m.seq === unreadFromSeq) {
        out.push({ kind: "unread", key: "unread-divider" });
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
  }, [messages, lookup, meId, isGroup, unreadFromSeq]);

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

  // A jump scrolls the message to the middle and marks it for a moment.
  const [flashed, setFlashed] = useState<number | null>(null);
  useEffect(() => {
    if (!focus) return;
    // The message itself, or the next one after it (a deleted number, or a system line, has no row of its own).
    const rows = [...(scrollRef.current?.querySelectorAll<HTMLElement>("[data-seq]") ?? [])];
    const bySeq = rows.map((r) => ({ r, seq: Number(r.dataset.seq) })).sort((a, b) => a.seq - b.seq);
    const el = (bySeq.find((x) => x.seq >= focus.seq) ?? bySeq[bySeq.length - 1])?.r;
    if (!el) return;
    const seq = Number(el.dataset.seq);
    el.scrollIntoView({ block: "center" });
    setFlashed(seq);
    const t = setTimeout(() => setFlashed(null), 2200);
    return () => clearTimeout(t);
  }, [focus, rows.length]);

  // Scrolled well away from the newest messages: offer the way back.
  const [away, setAway] = useState(false);
  // Back from a window to the live end: start at the newest message again.
  const wasWindow = useRef(false);
  useEffect(() => {
    if (wasWindow.current && !windowMode) {
      scrollRef.current?.scrollTo({ top: 0 });
      setAway(false);
    }
    wasWindow.current = !!windowMode;
  }, [windowMode]);

  return (
    <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box
        ref={scrollRef}
        onScroll={(e) => setAway(e.currentTarget.scrollTop < -400)}
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
          if (row.kind === "unread") {
            return (
              <Box key={row.key} role="separator" sx={{ display: "flex", alignItems: "center", gap: 1, my: 1.5 }}>
                <Box sx={{ flex: 1, height: "1px", bgcolor: "error.main" }} />
                <Typography variant="caption" sx={{ color: "error.main", fontWeight: 600 }}>
                  New messages
                </Typography>
                <Box sx={{ flex: 1, height: "1px", bgcolor: "error.main" }} />
              </Box>
            );
          }
          const m = row.message;
          return (
            <Box
              key={row.key}
              data-seq={m.seq}
              sx={{
                mt: row.gap ? 1.5 : 0.25,
                borderRadius: 1,
                transition: "background-color 0.4s",
                bgcolor: flashed === m.seq ? (t) => alpha(t.palette.primary.main, 0.16) : "transparent",
              }}
            >
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
                customEmoji={customEmoji}
                customById={customById}
                canPin={canPin}
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
      {(away || windowMode) && (
        <Fab
          size="small"
          variant="extended"
          color="primary"
          onClick={() => (windowMode ? onJumpToPresent() : scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }))}
          aria-label="Jump to present"
          sx={{ position: "absolute", right: 16, bottom: 12, textTransform: "none" }}
        >
          <KeyboardArrowDownIcon fontSize="small" sx={{ mr: 0.5 }} /> Jump to present
        </Fab>
      )}
    </Box>
  );
}
