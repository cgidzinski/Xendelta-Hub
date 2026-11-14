import { memo, useState, type KeyboardEvent } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box, Link } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import type { CustomEmoji } from "@shared/emoji";
import { CustomEmojiImage } from "../emoji/EmojiText";
import { EMOJI_SCHEME, SPOILER_SCHEME, emojiIdFromHref, isSpoilerHref, prepareMarkdown } from "./markdownPrep";

// A chat message's Markdown: bold, italic, strikethrough, code, quotes, lists, links, and ||spoilers||. It is drawn as
// React elements, never as an HTML string, and raw HTML is dropped, so a message can't inject markup or script. Headings,
// tables and pictures are not part of chat: their words show, and nothing is loaded from another site (a picture would
// tell that site who is reading). Custom emoji and spoilers are read from links that prepareMarkdown makes.
const ALLOWED = ["p", "strong", "em", "del", "code", "pre", "blockquote", "a", "br", "ul", "ol", "li"];

const sx: SxProps<Theme> = {
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  "& > :first-of-type": { mt: 0 },
  "& > :last-child": { mb: 0 },
  "& p": { m: 0, whiteSpace: "pre-wrap" },
  "& p + p, & p + pre, & pre + p, & blockquote + p, & p + blockquote": { mt: 0.75 },
  "& ul, & ol": { my: 0.5, pl: 3 },
  "& a": { color: "inherit", textDecoration: "underline" },
  // Code and quotes take their colour from the text around them, so they read in your own bubble as well.
  "& code": {
    px: 0.5,
    borderRadius: 0.5,
    fontFamily: "monospace",
    fontSize: "0.9em",
    bgcolor: "color-mix(in srgb, currentColor 16%, transparent)",
  },
  "& pre": {
    m: 0,
    my: 0.5,
    p: 1,
    borderRadius: 1,
    overflowX: "auto",
    bgcolor: "color-mix(in srgb, currentColor 12%, transparent)",
  },
  "& pre code": { p: 0, bgcolor: "transparent" },
  "& blockquote": { m: 0, my: 0.5, pl: 1.5, borderLeft: 3, borderColor: "currentColor", opacity: 0.85 },
};

const urlTransform = (url: string) =>
  url.startsWith(EMOJI_SCHEME) || url.startsWith(SPOILER_SCHEME) ? url : defaultUrlTransform(url);

/** Words hidden until someone clicks (or presses Enter on) them. */
function Spoiler({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const toggle = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setShown((v) => !v);
    }
  };
  return (
    <Box
      component="span"
      role="button"
      tabIndex={0}
      aria-label={shown ? "Spoiler, shown" : "Spoiler, press to show"}
      aria-pressed={shown}
      onClick={() => setShown((v) => !v)}
      onKeyDown={toggle}
      sx={{
        cursor: "pointer",
        borderRadius: 0.5,
        px: 0.25,
        bgcolor: shown ? "action.selected" : "text.primary",
        color: shown ? "inherit" : "transparent",
        "& *": { color: shown ? "inherit" : "transparent !important" },
      }}
    >
      {children}
    </Box>
  );
}

function MessageMarkdownView({ body, byId }: { body: string; byId: Map<string, CustomEmoji> }) {
  return (
    <Box component="div" sx={sx}>
      <ReactMarkdown
        skipHtml
        allowedElements={ALLOWED}
        unwrapDisallowed
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={{
          a: ({ href, children }) => {
            const emojiId = emojiIdFromHref(href);
            if (emojiId !== null) {
              const emoji = byId.get(emojiId);
              // An emoji that isn't known here (another community's, or removed) reads as its :name:.
              return emoji ? <CustomEmojiImage emoji={emoji} /> : <>{children}</>;
            }
            if (isSpoilerHref(href)) return <Spoiler>{children}</Spoiler>;
            return (
              <Link href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
                {children}
              </Link>
            );
          },
        }}
      >
        {prepareMarkdown(body)}
      </ReactMarkdown>
    </Box>
  );
}

export const MessageMarkdown = memo(MessageMarkdownView);
