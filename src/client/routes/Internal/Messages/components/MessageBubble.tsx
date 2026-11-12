import { useState } from "react";
import { Avatar, Box, Button, IconButton, Link, Menu, MenuItem, Typography } from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import ReplyIcon from "@mui/icons-material/Reply";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import type { ChatAttachment } from "@shared/chat";
import { formatFileSize } from "../../../../utils/fileUtils";
import { QUICK_REACTIONS } from "../../../../constants/chat";
import type { LocalMessage } from "../../../../utils/chatCache";
import { clock, nameFor, type PeopleLookup } from "../chatUi";

function AttachmentCard({
  attachment,
  mine,
  onOpen,
}: {
  attachment: ChatAttachment;
  mine: boolean;
  onOpen: () => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        width: 280,
        maxWidth: "100%",
        p: 1.25,
        borderRadius: 2,
        border: 1,
        borderStyle: attachment.removed ? "dashed" : "solid",
        borderColor: mine ? "primary.light" : "divider",
        bgcolor: mine ? "primary.dark" : "background.paper",
        color: mine ? "primary.contrastText" : "text.primary",
      }}
    >
      <InsertDriveFileOutlinedIcon sx={{ opacity: attachment.removed ? 0.5 : 1 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
          {attachment.name}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          {attachment.removed ? "Removed from XenDrive" : formatFileSize(attachment.size)}
        </Typography>
      </Box>
      {!attachment.removed && (
        <IconButton size="small" color="inherit" onClick={onOpen} aria-label={`Download ${attachment.name}`}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

export interface MessageBubbleProps {
  message: LocalMessage;
  meId: string;
  lookup: PeopleLookup;
  /** In a group, the sender's name and picture go above the first message of a run. */
  showSender: boolean;
  /** The message this one replies to, if it is loaded. */
  replyTarget?: LocalMessage;
  seenBy?: string[];
  canDelete: boolean;
  onReply: (m: LocalMessage) => void;
  onEdit: (m: LocalMessage) => void;
  onDelete: (m: LocalMessage) => void;
  onReact: (m: LocalMessage, emoji: string) => void;
  onRetry: (m: LocalMessage) => void;
  onDiscard: (m: LocalMessage) => void;
  onOpenAttachment: (m: LocalMessage, a: ChatAttachment) => void;
}

/** One message: the bubble, what it replies to, its files, reactions and status, and its action menu. */
export default function MessageBubble(props: MessageBubbleProps) {
  const { message: m, meId, lookup, showSender, replyTarget, seenBy, canDelete } = props;
  const mine = m.from === meId;
  const sender = lookup(m.from);
  const deleted = !!m.deletedAt;
  const stored = !m.status;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <Box
      className="chat-message"
      sx={{ display: "flex", gap: 1, alignItems: "flex-end", justifyContent: mine ? "flex-end" : "flex-start" }}
    >
      {!mine && (
        <Avatar
          src={showSender ? sender?.avatar || undefined : undefined}
          sx={{ width: 28, height: 28, visibility: showSender ? "visible" : "hidden" }}
        >
          {sender?.username[0]?.toUpperCase()}
        </Avatar>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: mine ? "flex-end" : "flex-start",
          maxWidth: { xs: "82%", md: 560 },
          minWidth: 0,
        }}
      >
        {showSender && !mine && (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5, mb: 0.25 }}>
            {sender?.username ?? "Former member"}
          </Typography>
        )}

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flexDirection: mine ? "row-reverse" : "row",
            maxWidth: "100%",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              alignItems: mine ? "flex-end" : "flex-start",
              minWidth: 0,
            }}
          >
            {replyTarget && !deleted && (
              <Box
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderLeft: 3,
                  borderColor: "primary.main",
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  maxWidth: "100%",
                }}
              >
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {nameFor(lookup, replyTarget.from, meId)} ·{" "}
                  {replyTarget.deletedAt ? "Deleted message" : replyTarget.body || "Attachment"}
                </Typography>
              </Box>
            )}

            {!deleted &&
              m.attachments.map((a) => (
                <AttachmentCard key={a.fileId} attachment={a} mine={mine} onOpen={() => props.onOpenAttachment(m, a)} />
              ))}

            {(deleted || m.body) && (
              <Box
                sx={{
                  px: 1.75,
                  py: 1,
                  borderRadius: 3,
                  bgcolor: deleted ? "transparent" : mine ? "primary.main" : "action.hover",
                  color: deleted ? "text.secondary" : mine ? "primary.contrastText" : "text.primary",
                  border: deleted ? 1 : 0,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  opacity: m.status === "sending" ? 0.7 : 1,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontStyle: deleted ? "italic" : "normal",
                }}
              >
                <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                  {deleted ? "This message was deleted" : m.body}
                </Typography>
              </Box>
            )}
          </Box>

          {stored && !deleted && (
            <IconButton
              size="small"
              aria-label="Message actions"
              onClick={(e) => setAnchor(e.currentTarget)}
              sx={{ opacity: { xs: 0.6, md: 0 }, ".chat-message:hover &, &:focus-visible": { opacity: 1 } }}
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        {m.reactions.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
            {m.reactions.map((r) => {
              const on = r.userIds.includes(meId);
              return (
                <Button
                  key={r.emoji}
                  size="small"
                  variant="outlined"
                  color={on ? "primary" : "inherit"}
                  onClick={() => props.onReact(m, r.emoji)}
                  aria-pressed={on}
                  aria-label={`${r.emoji} ${r.userIds.length}`}
                  sx={{
                    minWidth: 0,
                    px: 1,
                    py: 0,
                    borderRadius: 4,
                    borderColor: on ? "primary.main" : "divider",
                    fontSize: 13,
                  }}
                >
                  {r.emoji} {r.userIds.length}
                </Button>
              );
            })}
          </Box>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, px: 0.5 }}>
          {m.status === "sending" && "Sending..."}
          {m.status === "failed" && (
            <>
              <Box component="span" sx={{ color: "error.main" }}>
                Not sent
              </Box>{" "}
              ·{" "}
              <Link component="button" type="button" onClick={() => props.onRetry(m)}>
                Retry
              </Link>{" "}
              ·{" "}
              <Link component="button" type="button" onClick={() => props.onDiscard(m)}>
                Discard
              </Link>
            </>
          )}
          {stored && (
            <>
              {clock(m.createdAt)}
              {m.editedAt && !deleted ? " · Edited" : ""}
              {seenBy && seenBy.length > 0
                ? ` · Seen${seenBy.length <= 3 ? ` by ${seenBy.join(", ")}` : ` by ${seenBy.length}`}`
                : ""}
            </>
          )}
        </Typography>
      </Box>

      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        <Box sx={{ display: "flex", gap: 0.5, px: 1.5, py: 0.5 }}>
          {QUICK_REACTIONS.map((emoji) => (
            <IconButton
              key={emoji}
              size="small"
              aria-label={`React with ${emoji}`}
              onClick={() => {
                props.onReact(m, emoji);
                close();
              }}
            >
              {emoji}
            </IconButton>
          ))}
        </Box>
        <MenuItem
          onClick={() => {
            props.onReply(m);
            close();
          }}
        >
          <ReplyIcon fontSize="small" sx={{ mr: 1.5 }} /> Reply
        </MenuItem>
        {m.body && (
          <MenuItem
            onClick={() => {
              void navigator.clipboard?.writeText(m.body);
              close();
            }}
          >
            <ContentCopyIcon fontSize="small" sx={{ mr: 1.5 }} /> Copy text
          </MenuItem>
        )}
        {mine && m.body && (
          <MenuItem
            onClick={() => {
              props.onEdit(m);
              close();
            }}
          >
            <EditOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} /> Edit
          </MenuItem>
        )}
        {canDelete && (
          <MenuItem
            sx={{ color: "error.main" }}
            onClick={() => {
              props.onDelete(m);
              close();
            }}
          >
            <DeleteOutlineIcon fontSize="small" sx={{ mr: 1.5 }} /> Delete
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
