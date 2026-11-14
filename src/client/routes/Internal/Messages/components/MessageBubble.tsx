import { useState } from "react";
import { Avatar, Box, Button, IconButton, Link, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import ReplyIcon from "@mui/icons-material/Reply";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import type { ChatAttachment } from "@shared/chat";
import { formatFileSize } from "../../../../utils/fileUtils";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import EmojiPopover from "../../../../components/emoji/EmojiPopover";
import { MessageMarkdown } from "../../../../components/chat/MessageMarkdown";
import { EmojiText, ReactionEmoji, reactionLabel } from "../../../../components/emoji/EmojiText";
import { customIdOfReaction, customReactionKey, plainEmojiText, type CustomEmoji } from "@shared/emoji";
import { plainMessageText } from "@shared/messageText";
import { quickReactions, readRecentEmoji, rememberEmoji } from "../../../../components/emoji/emojiPrefs";
import type { LocalMessage } from "../../../../utils/chatCache";
import type { Theme } from "@mui/material/styles";
import { roleTextColor } from "../../Communities/communityUi";
import { clock, nameFor, reactedBy, type PeopleLookup } from "../chatUi";
import { isEmojiOnly } from "../../../../components/emoji/emojiText";

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
  /** "bubbles" is a DM or group chat; "flat" is a community channel (a row per message, the sender above it). */
  layout?: "bubbles" | "flat";
  /** The custom emoji of this community or chat: to draw them, and to offer in the reaction picker. */
  customEmoji?: CustomEmoji[];
  customById?: Map<string, CustomEmoji>;
  /** The sender's role label and colour, shown in a channel. */
  senderMeta?: { color: string; role: string };
  onReply: (m: LocalMessage) => void;
  onEdit: (m: LocalMessage) => void;
  onDelete: (m: LocalMessage) => void;
  onReact: (m: LocalMessage, emoji: string) => void;
  onRetry: (m: LocalMessage) => void;
  onDiscard: (m: LocalMessage) => void;
  onOpenAttachment: (m: LocalMessage, a: ChatAttachment) => void;
}

/** One message: the bubble, what it replies to, its files, reactions and status, and its action menu. */
const NO_EMOJI: CustomEmoji[] = [];
const NO_EMOJI_BY_ID = new Map<string, CustomEmoji>();

export default function MessageBubble(props: MessageBubbleProps) {
  const {
    message: m,
    meId,
    lookup,
    showSender,
    replyTarget,
    seenBy,
    canDelete,
    layout = "bubbles",
    senderMeta,
  } = props;
  const customList = props.customEmoji ?? NO_EMOJI;
  const customById = props.customById ?? NO_EMOJI_BY_ID;
  const mine = m.from === meId;
  const sender = lookup(m.from);
  const deleted = !!m.deletedAt;
  // One to three emoji and nothing else is drawn large, with no bubble.
  const big = !deleted && m.attachments.length === 0 && isEmojiOnly(m.body);
  const stored = !m.status;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  // The full picker opens where the menu was, so the menu closes first and remembers its place.
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  // What you used lately comes first, so the row adapts to you. Read when the menu opens, not on every render.
  const quick = anchor ? quickReactions(readRecentEmoji()) : [];
  const react = (emoji: string) => {
    if (!customIdOfReaction(emoji)) rememberEmoji(emoji);
    props.onReact(m, emoji);
  };

  const menu = (
    <>
      <EmojiPopover
        anchorEl={pickerAnchor}
        onClose={() => setPickerAnchor(null)}
        onPick={react}
        custom={customList}
        onPickCustom={(e) => react(customReactionKey(e._id))}
        placement="below"
      />
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        <Box sx={{ display: "flex", gap: 0.5, px: 1.5, py: 0.5 }}>
          {quick.map((emoji) => (
            <IconButton
              key={emoji}
              size="small"
              aria-label={`React with ${emoji}`}
              onClick={() => {
                react(emoji);
                close();
              }}
            >
              {emoji}
            </IconButton>
          ))}
          <IconButton
            size="small"
            aria-label="More reactions"
            onClick={() => {
              setPickerAnchor(anchor);
              close();
            }}
          >
            <AddReactionOutlinedIcon fontSize="small" />
          </IconButton>
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
              void navigator.clipboard?.writeText(plainEmojiText(m.body));
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
    </>
  );

  if (layout === "flat") {
    const name = sender?.username ?? "Former member";
    return (
      <Box className="chat-message" sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", position: "relative" }}>
        <Avatar
          src={showSender ? sender?.avatar || undefined : undefined}
          sx={{ width: 36, height: 36, visibility: showSender ? "visible" : "hidden" }}
        >
          {sender?.username[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {showSender && (
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: (t: Theme) => roleTextColor(t, senderMeta?.color) ?? t.palette.text.primary,
                }}
                data-testid="sender-name"
              >
                {name}
              </Typography>
              {senderMeta?.role && (
                <Typography
                  variant="caption"
                  sx={{
                    px: 0.75,
                    border: 1,
                    borderRadius: 1,
                    borderColor: (t: Theme) => roleTextColor(t, senderMeta.color) ?? t.palette.divider,
                    color: (t: Theme) => roleTextColor(t, senderMeta.color) ?? t.palette.text.secondary,
                    fontWeight: 500,
                  }}
                >
                  {senderMeta.role}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {clock(m.createdAt)}
              </Typography>
            </Box>
          )}

          {replyTarget && !deleted && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary", mb: 0.25 }}>
              <ReplyIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" noWrap>
                Replying to {nameFor(lookup, replyTarget.from, meId)}:{" "}
                {replyTarget.deletedAt ? "Deleted message" : plainMessageText(replyTarget.body) || "Attachment"}
              </Typography>
            </Box>
          )}

          {(deleted || m.body) && (
            <Typography
              component="div"
              variant="body2"
              sx={{
                lineHeight: big ? 1.25 : 1.5,
                fontSize: big ? 36 : undefined,
                overflowWrap: "anywhere",
                opacity: m.status === "sending" ? 0.7 : 1,
                color: deleted ? "text.secondary" : "text.primary",
                fontStyle: deleted ? "italic" : "normal",
              }}
            >
              {deleted ? (
                "This message was deleted"
              ) : big ? (
                <EmojiText body={m.body} byId={customById} size={1.1} />
              ) : (
                <MessageMarkdown body={m.body} byId={customById} />
              )}
              {m.editedAt && !deleted && (
                <Typography component="span" variant="caption" color="text.secondary">
                  {" "}
                  (edited)
                </Typography>
              )}
            </Typography>
          )}

          {!deleted && m.attachments.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
              {m.attachments.map((a) => (
                <AttachmentCard
                  key={a.fileId}
                  attachment={a}
                  mine={false}
                  onOpen={() => props.onOpenAttachment(m, a)}
                />
              ))}
            </Box>
          )}

          {m.reactions.length > 0 && (
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
              {m.reactions.map((r) => {
                const on = r.userIds.includes(meId);
                return (
                  <Tooltip title={reactedBy(r.userIds, reactionLabel(r.emoji, customById), lookup, meId)}>
                    <Button
                      key={r.emoji}
                      size="small"
                      variant="outlined"
                      color={on ? "primary" : "inherit"}
                      onClick={() => props.onReact(m, r.emoji)}
                      aria-pressed={on}
                      aria-label={`${reactionLabel(r.emoji, customById)} ${r.userIds.length}`}
                      sx={{
                        minWidth: 0,
                        px: 1,
                        py: 0,
                        borderRadius: 4,
                        borderColor: on ? "primary.main" : "divider",
                        fontSize: 13,
                      }}
                    >
                      <ReactionEmoji reaction={r.emoji} byId={customById} /> {r.userIds.length}
                    </Button>
                  </Tooltip>
                );
              })}
            </Box>
          )}

          {(m.status === "sending" || m.status === "failed") && (
            <Typography variant="caption" color="text.secondary">
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
            </Typography>
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
        {menu}
      </Box>
    );
  }

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
                  {replyTarget.deletedAt ? "Deleted message" : plainMessageText(replyTarget.body) || "Attachment"}
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
                  px: big ? 0.5 : 1.75,
                  py: big ? 0 : 1,
                  borderRadius: 3,
                  bgcolor: deleted || big ? "transparent" : mine ? "primary.main" : "action.hover",
                  color: deleted ? "text.secondary" : mine ? "primary.contrastText" : "text.primary",
                  border: deleted ? 1 : 0,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  opacity: m.status === "sending" ? 0.7 : 1,
                  overflowWrap: "anywhere",
                  fontStyle: deleted ? "italic" : "normal",
                }}
              >
                <Typography
                  component="div"
                  variant="body2"
                  sx={{ lineHeight: big ? 1.25 : 1.5, fontSize: big ? 40 : undefined }}
                >
                  {deleted ? (
                    "This message was deleted"
                  ) : big ? (
                    <EmojiText body={m.body} byId={customById} size={1.1} />
                  ) : (
                    <MessageMarkdown body={m.body} byId={customById} />
                  )}
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
                <Tooltip title={reactedBy(r.userIds, reactionLabel(r.emoji, customById), lookup, meId)}>
                  <Button
                    key={r.emoji}
                    size="small"
                    variant="outlined"
                    color={on ? "primary" : "inherit"}
                    onClick={() => props.onReact(m, r.emoji)}
                    aria-pressed={on}
                    aria-label={`${reactionLabel(r.emoji, customById)} ${r.userIds.length}`}
                    sx={{
                      minWidth: 0,
                      px: 1,
                      py: 0,
                      borderRadius: 4,
                      borderColor: on ? "primary.main" : "divider",
                      fontSize: 13,
                    }}
                  >
                    <ReactionEmoji reaction={r.emoji} byId={customById} /> {r.userIds.length}
                  </Button>
                </Tooltip>
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

      {menu}
    </Box>
  );
}
