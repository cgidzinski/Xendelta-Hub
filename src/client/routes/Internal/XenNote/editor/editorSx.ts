import { alpha, type Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material";

// How a page's text looks. Everything is drawn from theme tokens (no hex or rgba literals), so it follows light and dark.

const CALLOUT: Record<string, "info" | "success" | "warning" | "error"> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
};

export const editorSx: SxProps<Theme> = (theme: Theme) => {
  // The card radius (RADIUS.lg in theme/index.ts, in px).
  const radius = Number(theme.shape.borderRadius) * 2;
  return {
    "& .ProseMirror": {
      outline: "none",
      minHeight: 240,
      fontSize: "1rem",
      lineHeight: 1.7,
      wordBreak: "break-word",
      paddingBottom: theme.spacing(8),
    },
    "& .ProseMirror > * + *": { marginTop: theme.spacing(1) },
    "& .ProseMirror p": { margin: 0 },
    "& .ProseMirror h1, & .ProseMirror h2, & .ProseMirror h3": {
      margin: 0,
      marginTop: theme.spacing(2),
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.3,
    },
    "& .ProseMirror h1": { fontSize: "1.75rem" },
    "& .ProseMirror h2": { fontSize: "1.4rem" },
    "& .ProseMirror h3": { fontSize: "1.15rem" },
    "& .ProseMirror ul, & .ProseMirror ol": { paddingLeft: theme.spacing(3), margin: 0 },
    "& .ProseMirror li > p": { margin: 0 },
    "& .ProseMirror blockquote": {
      margin: 0,
      paddingLeft: theme.spacing(2),
      borderLeft: `3px solid ${theme.palette.divider}`,
      color: theme.palette.text.secondary,
    },
    "& .ProseMirror hr": { border: 0, borderTop: `1px solid ${theme.palette.divider}`, margin: theme.spacing(2, 0) },
    "& .ProseMirror code": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "0.9em",
      padding: "0.1em 0.35em",
      borderRadius: 4,
      backgroundColor: theme.palette.action.hover,
    },
    "& .ProseMirror pre": {
      margin: 0,
      padding: theme.spacing(1.5),
      borderRadius: radius,
      border: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.action.hover,
      overflowX: "auto",
    },
    "& .ProseMirror pre code": { padding: 0, backgroundColor: "transparent" },
    "& .ProseMirror a": { color: theme.palette.primary.main, cursor: "pointer" },

    // To-do lists
    "& .ProseMirror ul[data-type='taskList']": { listStyle: "none", paddingLeft: 0 },
    "& .ProseMirror ul[data-type='taskList'] li": { display: "flex", alignItems: "flex-start", gap: theme.spacing(1) },
    "& .ProseMirror ul[data-type='taskList'] li > label": { marginTop: "0.35em", userSelect: "none", flexShrink: 0 },
    "& .ProseMirror ul[data-type='taskList'] li > div": { flex: 1, minWidth: 0 },
    "& .ProseMirror ul[data-type='taskList'] li[data-checked='true'] > div": {
      color: theme.palette.text.secondary,
      textDecoration: "line-through",
    },
    "& .ProseMirror ul[data-type='taskList'] input[type='checkbox']": {
      width: 18,
      height: 18,
      accentColor: theme.palette.primary.main,
      cursor: "pointer",
    },

    // Tables
    "& .ProseMirror table": {
      display: "block",
      overflowX: "auto",
      borderCollapse: "collapse",
      maxWidth: "100%",
    },
    "& .ProseMirror th, & .ProseMirror td": {
      border: `1px solid ${theme.palette.divider}`,
      padding: theme.spacing(0.75, 1.25),
      minWidth: 96,
      verticalAlign: "top",
      position: "relative",
    },
    "& .ProseMirror th": { backgroundColor: theme.palette.action.hover, fontWeight: 600, textAlign: "left" },
    "& .ProseMirror .selectedCell": { backgroundColor: alpha(theme.palette.primary.main, 0.12) },

    // Callouts
    "& .ProseMirror div[data-type='callout']": {
      padding: theme.spacing(1.25, 1.75),
      borderRadius: radius,
      border: `1px solid ${theme.palette.divider}`,
    },
    ...Object.fromEntries(
      Object.entries(CALLOUT).map(([tone, key]) => [
        `& .ProseMirror div[data-type='callout'][data-tone='${tone}']`,
        {
          backgroundColor: alpha(theme.palette[key].main, theme.palette.mode === "dark" ? 0.18 : 0.1),
          borderColor: alpha(theme.palette[key].main, 0.5),
        },
      ]),
    ),

    // Links to other pages and tags
    "& .ProseMirror span[data-type='wikiLink']": {
      color: theme.palette.primary.main,
      borderBottom: `1px solid ${theme.palette.primary.main}`,
    },
    "& .ProseMirror span[data-type='wikiLink'][data-locked]": {
      color: theme.palette.text.secondary,
      borderBottom: `1px dashed ${theme.palette.text.disabled}`,
    },
    "& .ProseMirror span[data-type='hashtag']": { color: theme.palette.primary.main },

    // The hint in an empty line
    "& .ProseMirror p.is-empty::before, & .ProseMirror h1.is-empty::before, & .ProseMirror h2.is-empty::before, & .ProseMirror h3.is-empty::before":
      {
        content: "attr(data-placeholder)",
        color: theme.palette.text.disabled,
        float: "left",
        height: 0,
        pointerEvents: "none",
      },
    "& .ProseMirror .ProseMirror-selectednode": { outline: `2px solid ${theme.palette.primary.main}`, borderRadius: 4 },
    "& .ProseMirror .ProseMirror-gapcursor::after": { borderTopColor: theme.palette.text.primary },
  };
};
