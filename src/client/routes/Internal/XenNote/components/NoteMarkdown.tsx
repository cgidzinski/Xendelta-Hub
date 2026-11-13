import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box, Link } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { remarkWikiLinks, wikiTitleFromHref, WIKI_SCHEME } from "../noteMarkdown";

interface NoteMarkdownProps {
  text: string;
  /**
   * The id of the note a [[title]] means, or null if there is none. Leave it out where links can't be followed (a public
   * page): a [[link]] is then just its words.
   */
  resolve?: (title: string) => string | null;
  /** Called with the note's id when a resolved [[link]] is clicked. Without it a resolved link is not clickable. */
  onOpenNote?: (id: string) => void;
  sx?: SxProps<Theme>;
}

// A note's text as Markdown. It is rendered to React elements, never to an HTML string, and raw HTML in the text is
// dropped (skipHtml), so nothing a note says can inject markup or script. Link addresses go through react-markdown's own
// check (no javascript: and the like). Pictures are not loaded from other sites (that would tell them who reads the note):
// they show as their description. Single line breaks are kept, as plain text notes have always had them.
const markdownSx: SxProps<Theme> = {
  wordBreak: "break-word",
  fontSize: "0.875rem",
  lineHeight: 1.5,
  "& > :first-of-type": { mt: 0 },
  "& > :last-child": { mb: 0 },
  "& p": { my: 0.75, whiteSpace: "pre-line" },
  "& h1, & h2, & h3, & h4, & h5, & h6": { mt: 1.5, mb: 0.5, fontWeight: 700, lineHeight: 1.3 },
  "& h1": { fontSize: "1.25rem" },
  "& h2": { fontSize: "1.125rem" },
  "& h3, & h4, & h5, & h6": { fontSize: "1rem" },
  "& ul, & ol": { my: 0.75, pl: 3 },
  "& li": { my: 0.25 },
  "& li > p": { my: 0 },
  "& code": { bgcolor: "action.hover", px: 0.5, borderRadius: 0.5, fontFamily: "monospace", fontSize: "0.85em" },
  "& pre": { bgcolor: "action.hover", p: 1, borderRadius: 1, overflowX: "auto", my: 1 },
  "& pre code": { bgcolor: "transparent", p: 0 },
  "& blockquote": { m: 0, my: 1, pl: 1.5, borderLeft: 3, borderColor: "divider", color: "text.secondary" },
  "& hr": { border: 0, borderTop: 1, borderColor: "divider", my: 1.5 },
  "& table": { borderCollapse: "collapse", my: 1 },
  "& th, & td": { border: 1, borderColor: "divider", px: 1, py: 0.5 },
  "& input[type=checkbox]": { mr: 0.75 },
  "& li.task-list-item": { listStyle: "none", ml: -2.5 },
};

const urlTransform = (url: string) => (url.startsWith(WIKI_SCHEME) ? url : defaultUrlTransform(url));

function NoteMarkdownView({ text, resolve, onOpenNote, sx }: NoteMarkdownProps) {
  return (
    <Box sx={[markdownSx, ...(Array.isArray(sx) ? sx : [sx])]}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        urlTransform={urlTransform}
        components={{
          a: ({ href, children }) => {
            const title = wikiTitleFromHref(href);
            if (title !== null) {
              // Where links can't be followed, a [[link]] is only its words.
              if (!resolve) return <>{children}</>;
              const id = resolve(title);
              if (!id) {
                return (
                  <Box
                    component="span"
                    title={`No note called “${title}”`}
                    sx={{ color: "text.disabled", borderBottom: 1, borderStyle: "dashed" }}
                  >
                    {children}
                  </Box>
                );
              }
              if (!onOpenNote)
                return (
                  <Box component="span" sx={{ color: "primary.main" }}>
                    {children}
                  </Box>
                );
              return (
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  title={`Open “${title}”`}
                  onClick={(e) => {
                    e.stopPropagation(); // inside a card: open the linked note, not this one
                    onOpenNote(id);
                  }}
                  sx={{ verticalAlign: "baseline", font: "inherit", textAlign: "inherit" }}
                >
                  {children}
                </Link>
              );
            }
            return (
              <Link
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                underline="hover"
                onClick={(e) => e.stopPropagation()}
              >
                {children}
              </Link>
            );
          },
          img: ({ alt }) => (
            <Box component="span" sx={{ fontStyle: "italic", color: "text.secondary" }}>
              {alt ? `[image: ${alt}]` : "[image]"}
            </Box>
          ),
          table: ({ children }) => (
            <Box sx={{ overflowX: "auto" }}>
              <table>{children}</table>
            </Box>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  );
}

/** A note's text as Markdown, with [[links]] to other notes. See the notes above for what it will and won't render. */
export default memo(NoteMarkdownView);
