import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Button, Dialog, IconButton, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import { useLocation, useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import type { ChatAttachment, ChatConversation } from "@shared/chat";
import type { CustomEmojiScope } from "@shared/emoji";
import { emojiOfScope, useCustomEmoji } from "../../../../hooks/emoji/useCustomEmoji";
import { api } from "../../../../config/api";
import { useAuth } from "../../../../contexts/AuthContext";
import {
  newClientId,
  useAroundMessages,
  useChatActions,
  useDiscardLocalMessage,
  useMessages,
  useSendMessage,
} from "../../../../hooks/chat/useChat";
import { useTypingUsers } from "../../../../hooks/chat/useTyping";
import { useChatAttachments } from "../../../../hooks/chat/useChatAttachments";
import { chronological, peopleInHistory, type LocalMessage } from "../../../../utils/chatCache";
import { firstUnreadSeq, jumpTarget, messageLink, unreadDivider } from "../../../../utils/chatJump";
import EmptyState from "../../../../components/ui/EmptyState";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import PinsButton from "../../../../components/chat/PinsButton";
import ChatSearchButton from "../../../../components/chat/ChatSearchButton";
import ThreadPanel from "../../../../components/chat/ThreadPanel";
import ThreadsButton from "../../../../components/chat/ThreadsButton";
import AttachButton from "./AttachButton";
import AttachmentTray from "./AttachmentTray";
import Composer from "./Composer";
import DriveFilePicker from "./DriveFilePicker";
import MessageList from "./MessageList";
import { usePeopleLookup } from "../chatUi";

interface ChatPaneProps {
  conversationId: string;
  /** The conversation as the chat components read it. A community channel is described as one (utils/communityChat). */
  conversation: ChatConversation;
  /** What the composer says "Message ..." about. */
  title: string;
  /** The top bar. It gets who is typing, which a chat shows under its name. */
  header: (context: { typingNames: string[]; pins: ReactNode; search: ReactNode; threads: ReactNode }) => ReactNode;
  /** A community channel draws a row per message instead of bubbles. */
  layout?: "bubbles" | "flat";
  /** Whether the viewer may delete anyone's message. By default only a chat's owner may. */
  canModerate?: boolean;
  /** False where the viewer can read but not post (a read-only channel). */
  canPost?: boolean;
  /** A sender's role label and colour, for a channel. */
  senderMeta?: (userId: string | null) => { color: string; role: string } | undefined;
  /** May this person pin and unpin here? (A community says so with the pin permission; a chat lets any member.) */
  canPin?: boolean;
  /** May this person use @everyone and @here here? */
  canPingAll?: boolean;
  /** Set for a community channel, so a search can be widened to the whole community. */
  communityId?: string;
  /** Whose custom emoji are used here: the community's for a channel, the chat's own otherwise. */
  emojiScope: CustomEmojiScope;
  emptyDescription: string;
}

/**
 * The part of a conversation that is the same everywhere: the history, the composer, replying, editing, attaching,
 * reading and reacting. A DM or group chat (Thread) and a community channel both put their own header on it.
 */
export default function ChatPane({
  conversationId,
  conversation,
  title,
  header,
  layout,
  canModerate,
  canPost = true,
  senderMeta,
  canPin = true,
  canPingAll = false,
  emojiScope,
  communityId,
  emptyDescription,
}: ChatPaneProps) {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();

  const allEmoji = useCustomEmoji().emoji;
  const customEmoji = useMemo(() => emojiOfScope(allEmoji, emojiScope), [allEmoji, emojiScope.type, emojiScope.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const messagesQuery = useMessages(conversationId);
  const { edit, remove, react, markRead, removeEmbeds, pin } = useChatActions();
  const send = useSendMessage(conversationId);
  const discard = useDiscardLocalMessage(conversationId);
  const typingNames = useTypingUsers(conversationId);

  const [replyTo, setReplyTo] = useState<LocalMessage | undefined>();
  const [editing, setEditing] = useState<LocalMessage | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  // The thread open beside the chat (the number of the message it hangs off).
  const [openThread, setOpenThread] = useState<number | null>(null);
  const phone = useMediaQuery(useTheme().breakpoints.down("md"));
  const files = useChatAttachments(conversationId);

  // Jumping: a link, a reply's quote or "first unread" asks for a message that may not be loaded. If it is, scroll to it;
  // if not, show a window of history around it (kept apart from the live history) until the person goes back to the present.
  const location = useLocation();
  const navigate = useNavigate();
  const [windowSeq, setWindowSeq] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ seq: number; token: number } | null>(null);
  const around = useAroundMessages(conversationId, windowSeq);
  const windowReady = windowSeq !== null && !!around.data;
  const liveMessages = useMemo(() => chronological(messagesQuery.data), [messagesQuery.data]);
  const windowMessages = useMemo(() => chronological(around.data?.data), [around.data]);
  const messages = windowReady ? windowMessages : liveMessages;
  const history = useMemo(
    () => peopleInHistory(windowReady ? around.data!.data : messagesQuery.data),
    [windowReady, around.data, messagesQuery.data],
  );
  const lookup = usePeopleLookup(conversation, history);

  // Switching chats clears what was half done.
  useEffect(() => {
    setReplyTo(undefined);
    setEditing(undefined);
    setWindowSeq(null);
    setFocus(null);
    setOpenThread(null);
  }, [conversationId]);

  const jumpTo = useCallback(
    (seq: number) => {
      const loaded = windowSeq === null ? liveMessages : windowMessages;
      if (loaded.some((m) => m.seq === seq)) setFocus({ seq, token: Date.now() });
      else {
        setWindowSeq(seq);
        setFocus({ seq, token: Date.now() });
      }
    },
    [windowSeq, liveMessages, windowMessages],
  );
  const jumpToPresent = useCallback(() => {
    setWindowSeq(null);
    setFocus(null);
  }, []);

  // A link to a message (?seq=) opens at that message. The number is taken out of the address so reloading stays put.
  const linked = jumpTarget(location.search);
  useEffect(() => {
    if (linked === null) return;
    jumpTo(linked);
    const rest = new URLSearchParams(location.search);
    rest.delete("seq");
    navigate({ pathname: location.pathname, search: rest.toString() }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, conversationId]);

  // Where "new messages" starts is fixed when the chat opens: reading it marks it read, but the divider stays for now.
  const [unread, setUnread] = useState<{ from: number; count: number } | null>(null);
  const [barDismissed, setBarDismissed] = useState(false);
  const unreadFor = useRef<string | null>(null);
  useEffect(() => {
    if (unreadFor.current === conversationId) return;
    unreadFor.current = conversationId;
    const mine = conversation.members.find((m) => m.user_id === user.id)?.lastReadSeq ?? 0;
    const from = firstUnreadSeq(mine, conversation.unread);
    setUnread(from === null ? null : { from, count: conversation.unread });
    setBarDismissed(false);
  }, [conversationId, conversation, user.id]);
  const hasOlder = windowReady ? !!around.data?.data.pages[0]?.hasMore : !!messagesQuery.hasNextPage;
  const divider = unread ? unreadDivider(messages, unread.from, hasOlder) : null;

  // Opening a chat, or a message arriving while it is open, marks it read.
  const readUpTo = useRef(0);
  useEffect(() => {
    readUpTo.current = 0;
  }, [conversationId]);
  useEffect(() => {
    if (conversation.unread === 0 || document.visibilityState === "hidden") return;
    if (readUpTo.current >= conversation.seq) return;
    readUpTo.current = conversation.seq;
    markRead.mutate({ conversationId, seq: conversation.seq });
  }, [conversation, conversationId, markRead]);

  const fail = (e: any, fallback: string) =>
    enqueueSnackbar(e?.response?.data?.message || e?.message || fallback, { variant: "error" });

  const sendText = useCallback(
    (body: string) => {
      send.mutate({
        clientId: newClientId(),
        body,
        replyTo: replyTo?.seq,
        attachmentIds: files.attachments.map((a) => a.fileId),
        attachments: files.attachments,
      });
      setReplyTo(undefined);
      files.clear();
    },
    [send, replyTo, files],
  );

  const copyLink = async (m: LocalMessage) => {
    try {
      await navigator.clipboard.writeText(messageLink(window.location.origin, location.pathname, m.seq));
      enqueueSnackbar("Message link copied", { variant: "success" });
    } catch {
      enqueueSnackbar("Couldn't copy the link", { variant: "error" });
    }
  };

  const actions = {
    onReply: (m: LocalMessage) => {
      setEditing(undefined);
      setReplyTo(m);
    },
    onEdit: (m: LocalMessage) => {
      setReplyTo(undefined);
      setEditing(m);
    },
    onDelete: async (m: LocalMessage) => {
      const ok = await confirm({
        title: "Delete message",
        message: "It will be removed for everyone in this chat.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      try {
        await remove.mutateAsync({ conversationId, seq: m.seq });
      } catch (e) {
        fail(e, "Couldn't delete the message");
      }
    },
    onReact: (m: LocalMessage, emoji: string) => {
      const on = !m.reactions.find((r) => r.emoji === emoji)?.userIds.includes(user.id);
      react.mutate({ conversationId, seq: m.seq, emoji, on }, { onError: (e) => fail(e, "Couldn't react") });
    },
    onPin: (m: LocalMessage, on: boolean) =>
      pin.mutate(
        { conversationId, seq: m.seq, on },
        { onError: (e) => fail(e, on ? "Couldn't pin the message" : "Couldn't unpin the message") },
      ),
    onJumpTo: jumpTo,
    onCopyLink: copyLink,
    onOpenThread: (m: LocalMessage) => setOpenThread(m.seq),
    onRemoveEmbeds: (m: LocalMessage) =>
      removeEmbeds.mutate({ conversationId, seq: m.seq }, { onError: (e) => fail(e, "Couldn't remove the preview") }),
    onRetry: (m: LocalMessage) =>
      send.mutate({
        clientId: m.clientId!,
        body: m.body,
        replyTo: m.replyTo ?? undefined,
        attachmentIds: m.attachments.map((a) => a.fileId),
        attachments: m.attachments,
      }),
    onDiscard: (m: LocalMessage) => discard(m._id),
    onOpenAttachment: async (m: LocalMessage, a: ChatAttachment) => {
      try {
        const { url } = await api.get<{ url: string }>(
          `/api/chat/conversations/${conversationId}/messages/${m.seq}/attachments/${a.fileId}`,
        );
        window.open(url, "_blank", "noopener");
      } catch (e) {
        fail(e, "Couldn't open the file");
      }
    },
  };

  const threadPanel =
    openThread === null ? null : (
      <ThreadPanel
        conversationId={conversationId}
        rootSeq={openThread}
        conversation={conversation}
        layout={layout}
        customEmoji={customEmoji}
        canPost={canPost}
        canPingAll={canPingAll}
        canModerate={canModerate}
        senderMeta={senderMeta}
        onCopyLink={copyLink}
        onClose={() => setOpenThread(null)}
      />
    );

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", height: "100%" }}>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", height: "100%" }}>
        {header({
          typingNames,
          pins: <PinsButton conversationId={conversationId} lookup={lookup} canPin={canPin} />,
          threads: <ThreadsButton conversationId={conversationId} lookup={lookup} onOpen={setOpenThread} />,
          search: (
            <ChatSearchButton
              conversationId={conversationId}
              communityId={communityId}
              scopeNoun={communityId ? "channel" : "chat"}
              people={conversation.people}
              lookup={lookup}
            />
          ),
        })}

        {unread && !barDismissed && !windowReady && divider && divider.state !== "none" && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 2,
              py: 0.5,
              flexShrink: 0,
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            <Typography variant="body2" sx={{ flex: 1 }}>
              {unread.count} new {unread.count === 1 ? "message" : "messages"}
            </Typography>
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                jumpTo(unread.from);
                setBarDismissed(true);
              }}
            >
              Jump to first unread
            </Button>
            <IconButton size="small" color="inherit" aria-label="Dismiss" onClick={() => setBarDismissed(true)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        {messagesQuery.isLoading ? (
          <Box sx={{ flex: 1 }} aria-busy />
        ) : messages.length === 0 ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EmptyState title="No messages yet" description={emptyDescription} sx={{ py: 2 }} />
          </Box>
        ) : (
          <MessageList
            conversation={conversation}
            messages={messages}
            lookup={lookup}
            meId={user.id}
            hasMore={!windowReady && !!messagesQuery.hasNextPage}
            loadingMore={messagesQuery.isFetchingNextPage}
            focus={focus}
            unreadFromSeq={divider?.state === "at" ? divider.seq : undefined}
            windowMode={windowSeq !== null}
            onJumpToPresent={jumpToPresent}
            onLoadMore={() => messagesQuery.fetchNextPage()}
            typingNames={typingNames}
            customEmoji={customEmoji}
            canPin={canPin}
            layout={layout}
            canModerate={canModerate}
            senderMeta={senderMeta}
            actions={actions}
          />
        )}

        {canPost ? (
          <Composer
            conversationId={conversationId}
            title={title}
            lookup={lookup}
            customEmoji={customEmoji}
            mentionable={conversation.people}
            canPingAll={canPingAll}
            meId={user.id}
            replyTo={replyTo}
            editing={editing}
            onCancelContext={() => {
              setReplyTo(undefined);
              setEditing(undefined);
            }}
            hasAttachments={files.attachments.length > 0}
            busy={files.busy}
            attach={<AttachButton onFiles={files.addFiles} onChooseFromDrive={() => setPickerOpen(true)} />}
            tray={<AttachmentTray items={files.items} onRemove={files.remove} />}
            onSend={sendText}
            onSaveEdit={async (body) => {
              const target = editing;
              setEditing(undefined);
              if (!target || body === target.body) return;
              try {
                await edit.mutateAsync({ conversationId, seq: target.seq, body });
              } catch (e) {
                fail(e, "Couldn't save the edit");
              }
            }}
          />
        ) : (
          <Box sx={{ flexShrink: 0, px: 2.5, py: 2, borderTop: 1, borderColor: "divider" }}>
            <Typography variant="body2" color="text.secondary">
              You can read this channel but not post in it.
            </Typography>
          </Box>
        )}

        <DriveFilePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={files.addDriveFiles}
          excludeIds={files.items.map((i) => i.fileId ?? "")}
        />
      </Box>
      {threadPanel && !phone && (
        <Box sx={{ width: 380, flexShrink: 0, borderLeft: 1, borderColor: "divider", minHeight: 0 }}>{threadPanel}</Box>
      )}
      {threadPanel && phone && (
        <Dialog fullScreen open onClose={() => setOpenThread(null)}>
          {threadPanel}
        </Dialog>
      )}
    </Box>
  );
}
