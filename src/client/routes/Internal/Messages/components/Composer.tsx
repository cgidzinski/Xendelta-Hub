import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, IconButton, InputBase, Typography, useMediaQuery } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import { CHAT_BODY_MAX } from "@shared/chat";
import type { LocalMessage } from "../../../../utils/chatCache";
import { useTypingSender } from "../../../../hooks/chat/useTyping";
import { nameFor, type PeopleLookup } from "../chatUi";

interface ComposerProps {
  conversationId: string;
  title: string;
  lookup: PeopleLookup;
  meId: string;
  replyTo?: LocalMessage;
  editing?: LocalMessage;
  onCancelContext: () => void;
  /** Whether something other than text is ready to send (attached files). */
  hasAttachments: boolean;
  /** Send. Resolve when it has been handed off, so the box can clear. */
  onSend: (body: string) => void;
  onSaveEdit: (body: string) => void;
  /** The attach button, and the tray of files about to be sent. */
  attach?: ReactNode;
  tray?: ReactNode;
  /** True while an attached file is still uploading. */
  busy?: boolean;
}

/** The message box: reply and edit bars, an attachment tray, Enter to send (a button on a phone), typing signals. */
export default function Composer({
  conversationId,
  title,
  lookup,
  meId,
  replyTo,
  editing,
  onCancelContext,
  hasAttachments,
  onSend,
  onSaveEdit,
  attach,
  tray,
  busy,
}: ComposerProps) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const coarse = useMediaQuery("(pointer: coarse)");
  const { onInput, stop } = useTypingSender(conversationId);

  useEffect(() => {
    if (editing) setText(editing.body);
    input.current?.focus();
  }, [editing, replyTo]);
  useEffect(() => setText(""), [conversationId]);

  const canSend = (text.trim().length > 0 || (!editing && hasAttachments)) && !busy;

  const submit = () => {
    if (!canSend) return;
    stop();
    if (editing) onSaveEdit(text.trim());
    else onSend(text.trim());
    setText("");
  };

  return (
    <Box sx={{ px: { xs: 1, md: 3 }, pb: { xs: 1.5, md: 2.5 }, pt: 1, flexShrink: 0 }}>
      {(replyTo || editing) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 0.75,
            mb: 1,
            borderLeft: 3,
            borderColor: "primary.main",
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="primary" sx={{ fontWeight: 600, display: "block" }}>
              {editing ? "Editing message" : `Replying to ${nameFor(lookup, replyTo!.from, meId)}`}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {(editing ?? replyTo)!.body || "Attachment"}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onCancelContext} aria-label="Cancel">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2.5, bgcolor: "background.paper", p: 0.75 }}>
        {tray}
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5 }}>
          {!editing && attach}
          <InputBase
            multiline
            maxRows={6}
            fullWidth
            inputRef={input}
            value={text}
            placeholder={`Message ${title}`}
            onChange={(e) => {
              setText(e.target.value);
              onInput();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !coarse) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape" && (editing || replyTo)) onCancelContext();
            }}
            slotProps={{ input: { "aria-label": `Message ${title}`, maxLength: CHAT_BODY_MAX } }}
            sx={{ px: 1, py: 1, fontSize: 14 }}
          />
          <IconButton
            color="primary"
            onClick={submit}
            disabled={!canSend}
            aria-label={editing ? "Save" : "Send"}
            sx={{
              bgcolor: canSend ? "primary.main" : undefined,
              color: canSend ? "primary.contrastText" : undefined,
              borderRadius: 1.5,
              "&:hover": { bgcolor: "primary.dark" },
            }}
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
