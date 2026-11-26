import { useRef } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import type { XenNote } from "../../../../types/XenNote";

interface NoteEditorToolbarProps {
  editing: boolean;
  /** The saved note, or null while it is new (the reminder needs a saved note). */
  live: XenNote | null;
  autosave: "idle" | "saving" | "saved";
  addingPhotos: boolean;
  onAddPhotos: (files: File[]) => void;
  onColor?: (anchor: HTMLElement) => void;
  onLabels: (anchor: HTMLElement) => void;
  onReminder: (anchor: HTMLElement) => void;
  /** Opens the Share dialog; for a read-only note it shows who has the note and lets the person leave it. */
  onShare: () => void;
  onMore?: (anchor: HTMLElement) => void;
  moreOpen: boolean;
}

/** Note tools and autosave status below the content. */
export default function NoteEditorToolbar({
  editing,
  live,
  autosave,
  addingPhotos,
  onAddPhotos,
  onColor,
  onLabels,
  onReminder,
  onShare,
  onMore,
  moreOpen,
}: NoteEditorToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const reminderOn = !!live?.reminder && !live.reminder.sent;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 0.25,
        // Keep the buttons clear of a phone's rounded corners and home bar.
        px: { xs: "max(16px, env(safe-area-inset-left))", sm: 1 },
        pt: 0.75,
        pb: { xs: "max(14px, env(safe-area-inset-bottom))", sm: 0.75 },
        borderTop: 1,
        flexShrink: 0,
        borderColor: "divider",
      }}
    >
      {autosave !== "idle" && (
        <Typography variant="caption" color="text.secondary" role="status" sx={{ mr: "auto", pl: 1 }}>
          {autosave === "saving" ? "Saving…" : "Saved"}
        </Typography>
      )}
      {editing && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            id="xennote-photo-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              onAddPhotos(files);
            }}
          />
          <Tooltip title="Add photos">
            <IconButton
              size="small"
              aria-label="Add photos"
              disabled={addingPhotos}
              onClick={() => fileInput.current?.click()}
            >
              <AddPhotoAlternateOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}
      {onColor && (
        <Tooltip title="Colour">
          <IconButton size="small" aria-label="Colour" onClick={(e) => onColor(e.currentTarget)}>
            <PaletteOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {editing && (
        <Tooltip title="Labels">
          <IconButton size="small" aria-label="Labels" onClick={(e) => onLabels(e.currentTarget)}>
            <LabelOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {live && (
        <Tooltip title="Share">
          <IconButton size="small" aria-label="Share" onClick={onShare}>
            <ShareOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {live && (
        <Tooltip title={live.reminder ? "Reminder" : "Remind me"}>
          <IconButton
            size="small"
            aria-label="Reminder"
            color={reminderOn ? "primary" : "default"}
            onClick={(e) => onReminder(e.currentTarget)}
          >
            {reminderOn ? <NotificationsActiveIcon fontSize="small" /> : <NotificationsNoneIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
      {onMore && (
        <Tooltip title="More note actions">
          <IconButton
            size="small"
            aria-label="More note actions"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={(e) => onMore(e.currentTarget)}
          >
            <MoreHorizIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
