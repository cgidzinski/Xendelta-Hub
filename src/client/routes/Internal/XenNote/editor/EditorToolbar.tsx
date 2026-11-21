import type { ReactElement } from "react";
import { Box, Divider, IconButton, Tooltip } from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import CodeIcon from "@mui/icons-material/Code";
import DataObjectIcon from "@mui/icons-material/DataObject";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LinkIcon from "@mui/icons-material/Link";
import RedoIcon from "@mui/icons-material/Redo";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import { useEditorState, type Editor } from "@tiptap/react";

interface EditorToolbarProps {
  editor: Editor;
  onPickFiles?: () => void;
  compact?: boolean;
  onLink: () => void;
  onNoteLink?: () => void;
}

interface Tool {
  label: string;
  icon: ReactElement;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

/** The formatting bar above a page's text: marks, headings, lists, blocks and attachments. Scrolls sideways on a phone. */
export default function EditorToolbar({
  editor,
  onPickFiles,
  onLink,
  onNoteLink,
  compact = false,
}: EditorToolbarProps) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      callout: e.isActive("callout"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  const groups: Tool[][] = [
    [
      { label: "Undo", icon: <UndoIcon />, disabled: !s.canUndo, run: () => chain().undo().run() },
      { label: "Redo", icon: <RedoIcon />, disabled: !s.canRedo, run: () => chain().redo().run() },
    ],
    [
      { label: "Bold", icon: <FormatBoldIcon />, active: s.bold, run: () => chain().toggleBold().run() },
      { label: "Italic", icon: <FormatItalicIcon />, active: s.italic, run: () => chain().toggleItalic().run() },
      {
        label: "Strikethrough",
        icon: <StrikethroughSIcon />,
        active: s.strike,
        run: () => chain().toggleStrike().run(),
      },
      { label: "Inline code", icon: <CodeIcon />, active: s.code, run: () => chain().toggleCode().run() },
      { label: "Link", icon: <LinkIcon />, active: s.link, run: onLink },
      ...(onNoteLink ? [{ label: "Link to a note", icon: <b>[[</b>, run: onNoteLink }] : []),
    ],
    [
      { label: "Heading 1", icon: <b>H1</b>, active: s.h1, run: () => chain().toggleHeading({ level: 1 }).run() },
      { label: "Heading 2", icon: <b>H2</b>, active: s.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
      { label: "Heading 3", icon: <b>H3</b>, active: s.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      {
        label: "Bulleted list",
        icon: <FormatListBulletedIcon />,
        active: s.bullet,
        run: () => chain().toggleBulletList().run(),
      },
      {
        label: "Numbered list",
        icon: <FormatListNumberedIcon />,
        active: s.ordered,
        run: () => chain().toggleOrderedList().run(),
      },
      {
        label: "To-do list",
        icon: <CheckBoxOutlinedIcon />,
        active: s.task,
        run: () => chain().toggleTaskList().run(),
      },
    ],
    [
      { label: "Quote", icon: <FormatQuoteIcon />, active: s.quote, run: () => chain().toggleBlockquote().run() },
      {
        label: "Code block",
        icon: <DataObjectIcon />,
        active: s.codeBlock,
        run: () => chain().toggleCodeBlock().run(),
      },
      {
        label: "Callout",
        icon: <InfoOutlinedIcon />,
        active: s.callout,
        run: () =>
          chain()
            .insertContent({ type: "callout", attrs: { tone: "info" }, content: [{ type: "paragraph" }] })
            .run(),
      },
      {
        label: "Table",
        icon: <TableChartOutlinedIcon />,
        run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      ...(onPickFiles ? [{ label: "Image or file", icon: <AttachFileIcon />, run: onPickFiles }] : []),
    ],
  ];

  return (
    <Box
      role="toolbar"
      aria-label="Formatting"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        overflowX: "auto",
        py: 0.5,
        position: "sticky",
        top: compact ? undefined : 0,
        bottom: compact ? 0 : undefined,
        zIndex: 2,
        bgcolor: "background.paper",
        borderTop: compact ? 1 : 0,
        borderBottom: compact ? 0 : 1,
        borderColor: "divider",
      }}
    >
      {groups.map((group, g) => (
        <Box key={g} sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
          {g > 0 && <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />}
          {group
            .filter((tool) => !compact || tool.label !== "Callout")
            .map((tool) => (
              <Tooltip key={tool.label} title={tool.label}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={tool.label}
                    aria-pressed={tool.active ?? undefined}
                    color={tool.active ? "primary" : "default"}
                    disabled={tool.disabled}
                    // Keep the focus (and the selection) in the text while a button is pressed.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={tool.run}
                    sx={{ width: 36, height: 36, fontSize: 13 }}
                  >
                    {tool.icon}
                  </IconButton>
                </span>
              </Tooltip>
            ))}
        </Box>
      ))}
    </Box>
  );
}
