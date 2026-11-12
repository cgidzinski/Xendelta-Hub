import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Divider, Drawer, IconButton, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { useSnackbar } from "notistack";
import { chatTitle, type ChatAttachment } from "@shared/chat";
import { api } from "../../../config/api";
import { useAuth } from "../../../contexts/AuthContext";
import { CHAT_CALLS_ENABLED } from "../../../constants/chat";
import {
  newClientId,
  useChatActions,
  useConversation,
  useDiscardLocalMessage,
  useMessages,
  useSendMessage,
} from "../../../hooks/chat/useChat";
import { useTypingUsers } from "../../../hooks/chat/useTyping";
import { chronological, peopleInHistory, type LocalMessage } from "../../../utils/chatCache";
import EmptyState from "../../../components/ui/EmptyState";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import ChatAvatar from "./components/ChatAvatar";
import Composer from "./components/Composer";
import DetailsPanel from "./components/DetailsPanel";
import AddPeopleDialog from "./components/AddPeopleDialog";
import MessageList from "./components/MessageList";
import { usePeopleLookup } from "./chatUi";

interface ThreadProps {
  conversationId: string;
  /** Goes back to the list (a phone shows one pane at a time). */
  onBack: () => void;
}

/** One conversation: its header, history, composer and details. */
export default function Thread({ conversationId, onBack }: ThreadProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("lg"));
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();

  const conversationQuery = useConversation(conversationId);
  const messagesQuery = useMessages(conversationId);
  const { edit, remove, react, markRead } = useChatActions();
  const send = useSendMessage(conversationId);
  const discard = useDiscardLocalMessage(conversationId);
  const typingNames = useTypingUsers(conversationId);

  const [replyTo, setReplyTo] = useState<LocalMessage | undefined>();
  const [editing, setEditing] = useState<LocalMessage | undefined>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const conversation = conversationQuery.data;
  const messages = useMemo(() => chronological(messagesQuery.data), [messagesQuery.data]);
  const history = useMemo(() => peopleInHistory(messagesQuery.data), [messagesQuery.data]);
  const lookup = usePeopleLookup(conversation, history);

  // Switching chats clears what was half done.
  useEffect(() => {
    setReplyTo(undefined);
    setEditing(undefined);
    setDetailsOpen(false);
  }, [conversationId]);

  // Opening a chat, or a message arriving while it is open, marks it read.
  const readUpTo = useRef(0);
  useEffect(() => {
    readUpTo.current = 0;
  }, [conversationId]);
  useEffect(() => {
    if (!conversation || conversation.unread === 0 || document.visibilityState === "hidden") return;
    if (readUpTo.current >= conversation.seq) return;
    readUpTo.current = conversation.seq;
    markRead.mutate({ conversationId, seq: conversation.seq });
  }, [conversation, conversationId, markRead]);

  const fail = (e: any, fallback: string) =>
    enqueueSnackbar(e?.response?.data?.message || e?.message || fallback, { variant: "error" });

  const sendText = useCallback(
    (body: string) => {
      send.mutate({ clientId: newClientId(), body, replyTo: replyTo?.seq });
      setReplyTo(undefined);
    },
    [send, replyTo],
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

  if (conversationQuery.isError) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 2,
        }}
      >
        <EmptyState
          title="This chat isn't available"
          description="It may have been deleted, or you may no longer be in it."
        />
        <Button variant="contained" onClick={onBack}>
          Back to messages
        </Button>
      </Box>
    );
  }
  if (!conversation) {
    return <Box sx={{ p: 3 }} aria-busy />;
  }

  const title = chatTitle(conversation, user.id);
  const others = conversation.people.filter((p) => p._id !== user.id);
  const subtitle =
    typingNames.length > 0
      ? `${typingNames.join(", ")} typing…`
      : conversation.members.length > 2
        ? `${conversation.members.length} members`
        : others[0]
          ? ""
          : "Just you";

  const details = (
    <DetailsPanel
      conversation={conversation}
      meId={user.id}
      onAddPeople={() => setAddOpen(true)}
      onLeft={() => {
        setDetailsOpen(false);
        onBack();
      }}
    />
  );

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: { xs: 1, md: 2.5 },
            height: 68,
            flexShrink: 0,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          {phone && (
            <IconButton onClick={onBack} aria-label="Back to chats" edge="start">
              <ArrowBackIcon />
            </IconButton>
          )}
          <ChatAvatar conversation={conversation} meId={user.id} size={40} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {CHAT_CALLS_ENABLED && (
            <>
              <Tooltip title="Voice call">
                <IconButton aria-label="Voice call">
                  <CallOutlinedIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Video call">
                <IconButton aria-label="Video call">
                  <VideocamOutlinedIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip title="Add people">
            <IconButton onClick={() => setAddOpen(true)} aria-label="Add people">
              <PersonAddAltIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Chat details">
            <IconButton
              onClick={() => setDetailsOpen((v) => !v)}
              aria-label="Chat details"
              color={detailsOpen ? "primary" : "default"}
            >
              <InfoOutlinedIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {messagesQuery.isLoading ? (
          <Box sx={{ flex: 1 }} aria-busy />
        ) : messages.length === 0 ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EmptyState title="No messages yet" description={`Say hello to ${title}.`} sx={{ py: 2 }} />
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
            actions={actions}
          />
        )}

        <Composer
          conversationId={conversationId}
          title={title}
          lookup={lookup}
          meId={user.id}
          replyTo={replyTo}
          editing={editing}
          onCancelContext={() => {
            setReplyTo(undefined);
            setEditing(undefined);
          }}
          hasAttachments={false}
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
      </Box>

      {detailsOpen && wide && (
        <>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ width: 320, flexShrink: 0 }}>{details}</Box>
        </>
      )}
      {detailsOpen && !wide && (
        <Drawer
          anchor="right"
          open
          onClose={() => setDetailsOpen(false)}
          slotProps={{ paper: { sx: { width: { xs: "100%", sm: 360 } } } }}
        >
          <Box sx={{ display: "flex", justifyContent: "flex-start", p: 1 }}>
            <IconButton onClick={() => setDetailsOpen(false)} aria-label="Close details">
              <ArrowBackIcon />
            </IconButton>
          </Box>
          {details}
        </Drawer>
      )}

      <AddPeopleDialog open={addOpen} onClose={() => setAddOpen(false)} conversation={conversation} />
    </Box>
  );
}
