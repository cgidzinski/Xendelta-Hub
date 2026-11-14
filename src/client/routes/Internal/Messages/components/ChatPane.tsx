import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import type { ChatAttachment, ChatConversation } from "@shared/chat";
import type { CustomEmojiScope } from "@shared/emoji";
import { emojiOfScope, useCustomEmoji } from "../../../../hooks/emoji/useCustomEmoji";
import { api } from "../../../../config/api";
import { useAuth } from "../../../../contexts/AuthContext";
import {
  newClientId,
  useChatActions,
  useDiscardLocalMessage,
  useMessages,
  useSendMessage,
} from "../../../../hooks/chat/useChat";
import { useTypingUsers } from "../../../../hooks/chat/useTyping";
import { useChatAttachments } from "../../../../hooks/chat/useChatAttachments";
import { chronological, peopleInHistory, type LocalMessage } from "../../../../utils/chatCache";
import EmptyState from "../../../../components/ui/EmptyState";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import PinsButton from "../../../../components/chat/PinsButton";
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
  header: (context: { typingNames: string[]; pins: ReactNode }) => ReactNode;
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
  const files = useChatAttachments(conversationId);

  const messages = useMemo(() => chronological(messagesQuery.data), [messagesQuery.data]);
  const history = useMemo(() => peopleInHistory(messagesQuery.data), [messagesQuery.data]);
  const lookup = usePeopleLookup(conversation, history);

  // Switching chats clears what was half done.
  useEffect(() => {
    setReplyTo(undefined);
    setEditing(undefined);
  }, [conversationId]);

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

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      {header({ typingNames, pins: <PinsButton conversationId={conversationId} lookup={lookup} canPin={canPin} /> })}

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
          hasMore={!!messagesQuery.hasNextPage}
          loadingMore={messagesQuery.isFetchingNextPage}
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
  );
}
