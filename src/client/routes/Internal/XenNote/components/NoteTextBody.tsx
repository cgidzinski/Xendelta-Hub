import { useEffect, useMemo, useRef, useState } from "react";
import { Box, InputBase, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { completeWikiLink, normalizeTitle, openWikiLink } from "@shared/xennote/wikiLinks";
import { noteFieldSx } from "../noteFieldSx";
import NoteMarkdown from "./NoteMarkdown";

interface NoteTextBodyProps {
  /** A text note (written as Markdown, with a preview) or an image note (a plain caption). */
  type: "text" | "image";
  body: string;
  onBody: (body: string) => void;
  readOnly: boolean;
  /** The note's id, or null while it is new. */
  noteId: string | null;
  /** Every note with a title: what a [[link]] can point to and what typing "[[" suggests. */
  titles: Array<{ _id: string; title: string }>;
  onOpenNote: (id: string) => void;
  /** Changes when the editor opens for another note; the editor goes back to writing. */
  resetToken: unknown;
}

/**
 * The text of a note. A text note is written as Markdown and "Preview" shows it as it will look; typing "[[" offers
 * titles of other notes to link to.
 */
export default function NoteTextBody({
  type,
  body,
  onBody,
  readOnly,
  noteId,
  titles,
  onOpenNote,
  resetToken,
}: NoteTextBodyProps) {
  const theme = useTheme();
  const [mode, setMode] = useState<"write" | "preview">("write");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const fieldSx = noteFieldSx(theme);

  useEffect(() => {
    setMode("write");
    setCaret(0);
  }, [resetToken]);

  const resolveTitle = useMemo(() => {
    const byTitle = new Map<string, string>();
    for (const t of titles) if (!byTitle.has(normalizeTitle(t.title))) byTitle.set(normalizeTitle(t.title), t._id);
    return (title: string) => byTitle.get(normalizeTitle(title)) ?? null;
  }, [titles]);

  // Titles to suggest while a "[[" is open at the caret: those containing what was typed, starting with it first.
  const openLink = type === "text" && mode === "write" && !readOnly ? openWikiLink(body, caret) : null;
  const suggestions = useMemo(() => {
    if (!openLink || suggestDismissed) return [];
    const q = normalizeTitle(openLink.query);
    return titles
      .filter((t) => t._id !== noteId && normalizeTitle(t.title).includes(q))
      .sort((a, b) => Number(normalizeTitle(b.title).startsWith(q)) - Number(normalizeTitle(a.title).startsWith(q)))
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLink?.query, openLink?.start, suggestDismissed, titles, noteId]);
  useEffect(() => {
    setSuggestIndex(0);
    setSuggestDismissed(false);
  }, [openLink?.query, openLink?.start]);

  const chooseTitle = (title: string) => {
    const done = completeWikiLink(body, caret, title);
    if (!done) return;
    onBody(done.text);
    setCaret(done.caret);
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(done.caret, done.caret);
    });
  };

  return (
    <>
      {type === "text" && !readOnly && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, v: "write" | "preview" | null) => v && setMode(v)}
          aria-label="Write or preview"
          sx={{ alignSelf: "flex-end" }}
        >
          <ToggleButton value="write" sx={{ gap: 0.5, px: 1.25, py: 0.25, textTransform: "none" }}>
            <EditOutlinedIcon fontSize="small" />
            Write
          </ToggleButton>
          <ToggleButton value="preview" sx={{ gap: 0.5, px: 1.25, py: 0.25, textTransform: "none" }}>
            <VisibilityOutlinedIcon fontSize="small" />
            Preview
          </ToggleButton>
        </ToggleButtonGroup>
      )}
      {type === "text" && (mode === "preview" || readOnly) ? (
        <Box sx={{ ...fieldSx, display: "block", minHeight: 160 }}>
          {body.trim() ? (
            <NoteMarkdown text={body} resolve={resolveTitle} onOpenNote={onOpenNote} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Nothing to preview yet.
            </Typography>
          )}
        </Box>
      ) : (
        <>
          <InputBase
            fullWidth
            multiline
            minRows={type === "image" ? 4 : 9}
            maxRows={22}
            sx={fieldSx}
            autoFocus={!noteId && type === "text"}
            placeholder={type === "image" ? "Add a caption" : "Take a note… (Markdown works; [[ links to another note)"}
            value={body}
            onChange={(e) => {
              onBody(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (suggestions.length === 0) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSuggestIndex(
                  (i) => (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length,
                );
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                chooseTitle(suggestions[Math.min(suggestIndex, suggestions.length - 1)].title);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation(); // closes the suggestions, not the whole note
                setSuggestDismissed(true);
              }
            }}
            inputRef={bodyRef}
            disabled={readOnly}
            slotProps={{ input: { maxLength: 20000, "aria-label": type === "image" ? "Caption" : "Note" } }}
          />
          {suggestions.length > 0 && (
            <Box
              role="listbox"
              aria-label="Notes to link to"
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
                overflow: "hidden",
              }}
            >
              {suggestions.map((t, i) => (
                <Box
                  key={t._id}
                  role="option"
                  aria-selected={i === suggestIndex}
                  // mouse-down (not click) so the text field keeps focus and the caret
                  onMouseDown={(e) => {
                    e.preventDefault();
                    chooseTitle(t.title);
                  }}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    cursor: "pointer",
                    typography: "body2",
                    bgcolor: i === suggestIndex ? "action.selected" : "transparent",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  {t.title}
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </>
  );
}
