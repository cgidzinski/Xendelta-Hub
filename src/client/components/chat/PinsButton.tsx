import { useMemo, useState } from "react";
import { Avatar, Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import type { ChatPerson } from "@shared/chat";
import { plainMessageText } from "@shared/messageText";
import EmptyState from "../ui/EmptyState";
import { useChatActions, usePins } from "../../hooks/chat/useChat";
import { clock, dayLabel, type PeopleLookup } from "../../routes/Internal/Messages/chatUi";

interface Props {
  conversationId: string;
  lookup: PeopleLookup;
  /** May this person take pins off? */
  canPin: boolean;
}

/** A header button that opens the list of pinned messages in this chat, each with its sender, when it was said, and an unpin. */
export default function PinsButton({ conversationId, lookup, canPin }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { pin } = useChatActions();
  const pins = usePins(conversationId, !!anchor);
  // Someone who has left the chat still shows by name: the pins come with the people who sent them.
  const sender = useMemo(() => {
    const extra = new Map<string, ChatPerson>((pins.data?.people ?? []).map((p) => [p._id, p]));
    return (id: string | null | undefined) => lookup(id) ?? (id ? extra.get(id) : undefined);
  }, [lookup, pins.data?.people]);
  const messages = pins.data?.messages ?? [];

  return (
    <>
      <Tooltip title="Pinned messages">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Pinned messages" aria-haspopup="dialog">
          <PushPinOutlinedIcon />
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
            "aria-label": "Pinned messages",
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
          <Typography sx={{ fontWeight: 600 }}>Pinned messages</Typography>
        </Box>
        <Box sx={{ overflowY: "auto" }}>
          {pins.isLoading ? (
            <Box sx={{ p: 3 }} aria-busy />
          ) : messages.length === 0 ? (
            <EmptyState
              title="Nothing pinned"
              description={canPin ? "Pin a message from its menu to keep it here." : "Pinned messages show up here."}
              sx={{ py: 3 }}
            />
          ) : (
            messages.map((m) => {
              const who = sender(m.from);
              return (
                <Box
                  key={m._id}
                  sx={{
                    display: "flex",
                    gap: 1.25,
                    px: 2,
                    py: 1.25,
                    borderBottom: 1,
                    borderColor: "divider",
                    alignItems: "flex-start",
                  }}
                >
                  <Avatar src={who?.avatar || undefined} sx={{ width: 28, height: 28, fontSize: 13 }}>
                    {who?.username[0]?.toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {who?.username ?? "Former member"} · {dayLabel(m.createdAt)}, {clock(m.createdAt)}
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
                      {plainMessageText(m.body) ||
                        (m.gif ? "GIF" : m.voice ? "Voice message" : m.poll ? "Poll" : "Attachment")}
                    </Typography>
                  </Box>
                  {canPin && (
                    <Tooltip title="Unpin">
                      <IconButton
                        size="small"
                        aria-label="Unpin message"
                        disabled={pin.isPending}
                        onClick={() =>
                          pin.mutate(
                            { conversationId, seq: m.seq, on: false },
                            {
                              onError: (e: any) =>
                                enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't unpin it", {
                                  variant: "error",
                                }),
                            },
                          )
                        }
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              );
            })
          )}
        </Box>
      </Popover>
    </>
  );
}
