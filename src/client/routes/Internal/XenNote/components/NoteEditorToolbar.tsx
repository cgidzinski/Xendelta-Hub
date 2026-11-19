import { useRef } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import type { XenNote } from "../../../../types/XenNote";

interface NoteEditorToolbarProps {
  readOnly: boolean;
  /** The saved note, or null while it is new (the reminder needs a saved note). */
  live: XenNote | null;
  autosave: "idle" | "saving" | "saved";
  addingPhotos: boolean;
  /** Done is disabled while saving or when the link is not valid. */
  doneDisabled: boolean;
  onAddPhotos: (files: File[]) => void;
  onColor: (anchor: HTMLElement) => void;
  onLabels: (anchor: HTMLElement) => void;
  onNotebook: (anchor: HTMLElement) => void;
  onReminder: (anchor: HTMLElement) => void;
  onDone: () => void;
}

/** The bar under the note: photos, colour, labels, notebook, reminder, the autosave status and Done. */
export default function NoteEditorToolbar({
  readOnly,
  live,
  autosave,
  addingPhotos,
  doneDisabled,
  onAddPhotos,
  onColor,
  onLabels,
  onNotebook,
  onReminder,
  onDone,
}: NoteEditorToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const reminderOn = !!live?.reminder && !live.reminder.sent;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        px: 1,
        py: 0.75,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      {!readOnly && (
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
          <Tooltip title="Colour">
            <IconButton size="small" aria-label="Colour" onClick={(e) => onColor(e.currentTarget)}>
              <PaletteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Labels">
            <IconButton size="small" aria-label="Labels" onClick={(e) => onLabels(e.currentTarget)}>
              <LabelOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Notebook">
            <IconButton size="small" aria-label="Notebook" onClick={(e) => onNotebook(e.currentTarget)}>
              <MenuBookOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
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
      <Box sx={{ flex: 1 }} />
      {autosave !== "idle" && (
        <Typography variant="caption" color="text.secondary" role="status" sx={{ mr: 1 }}>
          {autosave === "saving" ? "Saving…" : "Saved"}
        </Typography>
      )}
      <Button variant="contained" onClick={onDone} disabled={doneDisabled}>
        {readOnly ? "Close" : "Done"}
      </Button>
    </Box>
  );
}
