import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, ButtonBase, IconButton, InputBase, Paper, Typography, useMediaQuery } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import EmojiEmotionsOutlinedIcon from "@mui/icons-material/EmojiEmotionsOutlined";
import EmojiPopover from "../../../../components/emoji/EmojiPopover";
import { loadEmoji, withTone, type EmojiEntry } from "../../../../components/emoji/emojiData";
import { readSkinTone, rememberEmoji } from "../../../../components/emoji/emojiPrefs";
import { shortcodeBeforeCaret, suggestShortcodes } from "../../../../components/emoji/emojiText";
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
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  // `:smi` suggests emoji: the list loads the first time a colon-word is typed.
  const [emojiList, setEmojiList] = useState<EmojiEntry[] | null>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const coarse = useMediaQuery("(pointer: coarse)");
  const { onInput, stop } = useTypingSender(conversationId);

  useEffect(() => {
    if (editing) setText(editing.body);
    input.current?.focus();
  }, [editing, replyTo]);
  useEffect(() => setText(""), [conversationId]);

  useEffect(() => {
    if (!emojiList && /(^|\s):[a-z0-9_+-]{2}/i.test(text)) void loadEmoji().then(setEmojiList, () => undefined);
  }, [text, emojiList]);
  const match = emojiList ? shortcodeBeforeCaret(text, caret) : null;
  const suggestions = match && emojiList ? suggestShortcodes(emojiList, match.query) : [];
  const suggesting = !!match && suggestions.length > 0 && dismissedAt !== match.start;
  useEffect(() => setPick(0), [match?.query]);

  /** Swap the `:partial` for the emoji, in the person's skin tone, and put the cursor after it. */
  const acceptSuggestion = (entry: EmojiEntry) => {
    if (!match) return;
    const emoji = withTone(entry, readSkinTone());
    rememberEmoji(emoji);
    setText(text.slice(0, match.start) + emoji + text.slice(caret));
    const pos = match.start + emoji.length;
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  // Put the emoji where the cursor is (replacing any selection), and leave the cursor after it.
  const insertEmoji = (emoji: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    setText((text.slice(0, start) + emoji + text.slice(end)).slice(0, CHAT_BODY_MAX));
    onInput();
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const canSend = (text.trim().length > 0 || (!editing && hasAttachments)) && !busy;

  const submit = () => {
    if (!canSend) return;
    stop();
    if (editing) onSaveEdit(text.trim());
    else onSend(text.trim());
    setText("");
  };

  return (
    <Box
      sx={{
        px: { xs: 1, md: 3 },
        pb: { xs: "calc(12px + env(safe-area-inset-bottom))", md: 2.5 },
        pt: 1,
        flexShrink: 0,
        position: "relative",
      }}
    >
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
          <IconButton aria-label="Add emoji" onClick={(e) => setEmojiAnchor(e.currentTarget)}>
            <EmojiEmotionsOutlinedIcon />
          </IconButton>
          <InputBase
            multiline
            maxRows={6}
            fullWidth
            inputRef={input}
            value={text}
            placeholder={`Message ${title}`}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              onInput();
            }}
            onKeyDown={(e) => {
              if (suggesting) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setPick((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  acceptSuggestion(suggestions[pick]!);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissedAt(match!.start);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey && !coarse) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape" && (editing || replyTo)) onCancelContext();
            }}
            slotProps={{
              input: {
                "aria-label": `Message ${title}`,
                maxLength: CHAT_BODY_MAX,
                onSelect: (e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0),
              },
            }}
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
      {suggesting && (
        <Paper
          variant="outlined"
          role="listbox"
          aria-label="Emoji suggestions"
          sx={{
            position: "absolute",
            left: { xs: 8, md: 24 },
            bottom: "100%",
            mb: 0.5,
            minWidth: 220,
            maxWidth: "calc(100% - 16px)",
            overflow: "hidden",
            zIndex: 1,
          }}
        >
          {suggestions.map((entry, i) => (
            <ButtonBase
              key={entry.order}
              role="option"
              aria-selected={i === pick}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => acceptSuggestion(entry)}
              onMouseEnter={() => setPick(i)}
              sx={{
                display: "flex",
                width: "100%",
                justifyContent: "flex-start",
                gap: 1.5,
                px: 1.5,
                py: 0.75,
                fontSize: 14,
                bgcolor: i === pick ? "action.selected" : "transparent",
              }}
            >
              <span style={{ fontSize: 20 }}>{withTone(entry, readSkinTone())}</span>
              <span>:{entry.shortcode}:</span>
            </ButtonBase>
          ))}
        </Paper>
      )}
      <EmojiPopover anchorEl={emojiAnchor} onClose={() => setEmojiAnchor(null)} onPick={insertEmoji} />
    </Box>
  );
}
