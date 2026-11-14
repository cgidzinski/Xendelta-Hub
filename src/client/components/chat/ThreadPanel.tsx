import { useEffect, useMemo, useRef, useState } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { useSnackbar } from "notistack";
import type { ChatAttachment, ChatConversation, ChatPerson } from "@shared/chat";
import type { CustomEmoji } from "@shared/emoji";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { newClientId, useChatActions } from "../../hooks/chat/useChat";
import { useDiscardLocalReply, useFollowThread, useSendThreadReply, useThread } from "../../hooks/chat/useThread";
import type { LocalMessage } from "../../utils/chatCache";
import { useConfirm } from "../ui/ConfirmProvider";
import EmptyState from "../ui/EmptyState";
import Composer from "../../routes/Internal/Messages/components/Composer";
import MessageBubble from "../../routes/Internal/Messages/components/MessageBubble";
import { usePeopleLookup, type PeopleLookup } from "../../routes/Internal/Messages/chatUi";

interface Props {
  conversationId: string;
  rootSeq: number;
  conversation: ChatConversation;
  layout?: "bubbles" | "flat";
  customEmoji?: CustomEmoji[];
  /** May this person reply here (the chat's own rule for posting)? */
  canPost: boolean;
  canPingAll?: boolean;
  canModerate?: boolean;
  senderMeta?: (userId: string | null) => { color: string; role: string } | undefined;
  /** Where to copy a link to the first message from. */
  onCopyLink: (m: LocalMessage) => void;
  onClose: () => void;
}

/** A thread: the message it hangs off, its replies, and a box to reply. Fills the side on a computer, the screen on a phone. */
export default function ThreadPanel({
  conversationId,
  rootSeq,
  conversation,
  layout,
  customEmoji,
  canPost,
  canPingAll,
  canModerate,
  senderMeta,
  onCopyLink,
  onClose,
}: Props) {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const thread = useThread(conversationId, rootSeq);
  const send = useSendThreadReply(conversationId, rootSeq);
  const discard = useDiscardLocalReply(conversationId, rootSeq);
  const follow = useFollowThread(conversationId, rootSeq);
  const { edit, remove, react, removeEmbeds } = useChatActions();

  const [replyTo, setReplyTo] = useState<LocalMessage | undefined>();
  const [editing, setEditing] = useState<LocalMessage | undefined>();
  const data = thread.data;
  const root = data?.root;
  const replies = data?.replies ?? [];
  const all = useMemo(() => (root ? [root, ...replies] : replies), [root, replies]);
  const bySeq = useMemo(() => new Map(all.map((m) => [m.seq, m])), [all]);

  // Those who have since left the chat come with the thread.
  const history = useMemo(
    () => new Map<string, ChatPerson>((data?.people ?? []).map((p) => [p._id, p])),
    [data?.people],
  );
  const lookup: PeopleLookup = usePeopleLookup(conversation, history);

  // New replies bring the end into view; opening starts there too.
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [replies.length, root?._id]);
  useEffect(() => {
    setReplyTo(undefined);
    setEditing(undefined);
  }, [rootSeq]);

  const fail = (e: any, fallback: string) =>
    enqueueSnackbar(e?.response?.data?.message || e?.message || fallback, { variant: "error" });

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
    onPin: () => undefined,
    onJumpTo: () => undefined,
    onCopyLink,
    onRemoveEmbeds: (m: LocalMessage) =>
      removeEmbeds.mutate({ conversationId, seq: m.seq }, { onError: (e) => fail(e, "Couldn't remove the preview") }),
    onRetry: (m: LocalMessage) => send.mutate({ clientId: m.clientId!, body: m.body, replyTo: m.replyTo ?? undefined }),
    onDiscard: (m: LocalMessage) => discard(m._id),
    onAttachmentUrl: async (m: LocalMessage, a: ChatAttachment) =>
      (
        await api.get<{ url: string }>(
          `/api/chat/conversations/${conversationId}/messages/${m.seq}/attachments/${a.fileId}`,
        )
      ).url,
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

  const bubble = (m: LocalMessage, showSender: boolean) => (
    <MessageBubble
      key={m._id}
      message={m}
      meId={user.id}
      lookup={lookup}
      showSender={showSender}
      replyTarget={m.replyTo ? bySeq.get(m.replyTo) : undefined}
      canDelete={m.from === user.id || (canModerate ?? false)}
      layout={layout}
      customEmoji={customEmoji}
      senderMeta={senderMeta?.(m.from)}
      {...actions}
    />
  );

  return (
    <Box
      component="section"
      aria-label="Thread"
      sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, bgcolor: "background.paper" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          pt: "env(safe-area-inset-top)",
          minHeight: 56,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography sx={{ fontWeight: 600, flex: 1 }}>Thread</Typography>
        {data && (
          <Tooltip title={data.following ? "Stop getting notified of replies" : "Get notified of replies"}>
            <IconButton
              aria-label={data.following ? "Unfollow thread" : "Follow thread"}
              aria-pressed={data.following}
              color={data.following ? "primary" : "default"}
              disabled={follow.isPending}
              onClick={() => follow.mutate(!data.following, { onError: (e) => fail(e, "Couldn't change that") })}
            >
              {data.following ? <NotificationsActiveIcon /> : <NotificationsNoneIcon />}
            </IconButton>
          </Tooltip>
        )}
        <IconButton aria-label="Close thread" onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 1.5 }}>
        {thread.isLoading ? (
          <Box aria-busy sx={{ p: 3 }} />
        ) : thread.isError || !root ? (
          <EmptyState title="Couldn't open this thread" description="It may have been deleted." sx={{ py: 3 }} />
        ) : (
          <>
            {bubble(root, true)}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, my: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {replies.length === 0
                  ? "No replies yet"
                  : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
              </Typography>
              <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            </Box>
            {replies.map((m, i) => bubble(m, replies[i - 1]?.from !== m.from))}
            <div ref={end} />
          </>
        )}
      </Box>

      {canPost ? (
        <Composer
          conversationId={conversationId}
          title="this thread"
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
          hasAttachments={false}
          onSend={(body) => {
            send.mutate({ clientId: newClientId(), body, replyTo: replyTo?.seq });
            setReplyTo(undefined);
          }}
          onSendVoice={(attachment, voice) => {
            send.mutate({
              clientId: newClientId(),
              body: "",
              attachmentIds: [attachment.fileId],
              attachments: [attachment],
              voice,
              replyTo: replyTo?.seq,
            });
            setReplyTo(undefined);
          }}
          onSendGif={(gif) => {
            send.mutate({ clientId: newClientId(), body: "", gif, replyTo: replyTo?.seq });
            setReplyTo(undefined);
          }}
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
            You can read this thread but not reply in it.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
