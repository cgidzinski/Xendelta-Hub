import { Box, Card, CardActionArea, Checkbox, Chip, IconButton, Stack, Typography } from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import LinkIcon from "@mui/icons-material/Link";
import type { PublicXenNote, XenNote } from "../../../../types/XenNote";
import { hostOf } from "../noteDraft";
import { noteSurfaceSx } from "../noteColors";

interface NoteCardProps {
  note: XenNote | PublicXenNote;
  onOpen?: () => void;
  /** Tick or untick checklist item `index` straight from the board. Omit for read-only. */
  onToggleItem?: (index: number) => void;
  onTogglePin?: () => void;
  onToggleArchive?: () => void;
}

const MAX_LINES = 8;
const MAX_ITEMS = 8;

/** One note on the board: its content for its type, labels, and quick pin/archive. */
export default function NoteCard({ note, onOpen, onToggleItem, onTogglePin, onToggleArchive }: NoteCardProps) {
  const full = "can_edit" in note ? note : null;
  const pinned = full?.pinned ?? false;
  const archived = full?.archived ?? false;
  const editable = !!full?.can_edit;
  const items = note.checklist;
  const lines = note.body.split("\n");

  const content = (
    <Box sx={{ p: 2, pr: editable ? 6 : 2 }}>
      {note.images.length > 0 && (
        <Box
          component="img"
          src={note.images[0].url}
          alt=""
          loading="lazy"
          sx={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 1, mb: 1.5, display: "block" }}
        />
      )}
      {note.images.length > 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          +{note.images.length - 1} more {note.images.length - 1 === 1 ? "photo" : "photos"}
        </Typography>
      )}

      {note.title && <Typography sx={{ fontWeight: 600, mb: 0.5, wordBreak: "break-word" }}>{note.title}</Typography>}

      {note.type === "link" && note.link.url && (
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 0.5 }}>
          <LinkIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: "break-word" }}>
              {note.link.title || hostOf(note.link.url)}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {hostOf(note.link.url)}
            </Typography>
            {note.link.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: "break-word" }}>
                {note.link.description}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {note.type === "checklist" ? (
        <Box>
          {items.slice(0, MAX_ITEMS).map((item, i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "flex-start" }}>
              <Checkbox
                size="small"
                checked={item.done}
                disabled={!onToggleItem}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleItem?.(i)}
                inputProps={{ "aria-label": item.text }}
                sx={{ p: 0.5, mr: 0.5 }}
              />
              <Typography
                variant="body2"
                sx={{
                  pt: 0.5,
                  wordBreak: "break-word",
                  textDecoration: item.done ? "line-through" : "none",
                  color: item.done ? "text.disabled" : "text.primary",
                }}
              >
                {item.text}
              </Typography>
            </Box>
          ))}
          {items.length > MAX_ITEMS && (
            <Typography variant="caption" color="text.secondary">
              +{items.length - MAX_ITEMS} more
            </Typography>
          )}
        </Box>
      ) : (
        note.type !== "link" &&
        note.body && (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {lines.slice(0, MAX_LINES).join("\n")}
            {lines.length > MAX_LINES ? "…" : ""}
          </Typography>
        )
      )}

      {note.labels.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ mt: 1.5, flexWrap: "wrap", gap: 0.5 }}>
          {note.labels.map((label) => (
            <Chip key={label} label={label} size="small" variant="outlined" />
          ))}
        </Stack>
      )}
    </Box>
  );

  return (
    <Card variant="outlined" sx={[{ position: "relative", breakInside: "avoid", mb: 2 }, noteSurfaceSx(note.color)]}>
      {onOpen ? <CardActionArea onClick={onOpen}>{content}</CardActionArea> : content}
      {editable && (
        <Box sx={{ position: "absolute", top: 4, right: 4, display: "flex", flexDirection: "column" }}>
          <IconButton size="small" aria-label={pinned ? "Unpin" : "Pin"} onClick={onTogglePin}>
            {pinned ? <PushPinIcon fontSize="small" color="primary" /> : <PushPinOutlinedIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" aria-label={archived ? "Unarchive" : "Archive"} onClick={onToggleArchive}>
            {archived ? <UnarchiveOutlinedIcon fontSize="small" /> : <ArchiveOutlinedIcon fontSize="small" />}
          </IconButton>
        </Box>
      )}
    </Card>
  );
}
