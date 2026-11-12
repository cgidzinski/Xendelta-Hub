import { useState } from "react";
import {
  Box,
  Card,
  CardActionArea,
  Checkbox,
  Chip,
  IconButton,
  LinearProgress,
  Menu,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import LinkIcon from "@mui/icons-material/Link";
import { NOTE_COLORS, type NoteColor } from "@shared/xennote/notes";
import type { PublicXenNote, XenNote } from "../../../../types/XenNote";
import { checklistProgress, hostOf } from "../noteDraft";
import { NOTE_COLOR_LABELS, noteSurfaceSx, swatchColor } from "../noteColors";

interface NoteCardProps {
  note: XenNote | PublicXenNote;
  onOpen?: () => void;
  /** Tick or untick checklist item `index` straight from the board. Omit for read-only. */
  onToggleItem?: (index: number) => void;
  onTogglePin?: () => void;
  onToggleArchive?: () => void;
  onColor?: (color: NoteColor) => void;
}

const MAX_LINES = 8;
const MAX_ITEMS = 6;

/** Up to three photos as a mosaic: one wide, two side by side, or a big one beside two small ones. */
function PhotoMosaic({ images }: { images: Array<{ url: string }> }) {
  const shown = images.slice(0, 3);
  const extra = images.length - shown.length;
  const tile = (url: string, sx: object = {}) => (
    <Box
      key={url}
      component="img"
      src={url}
      alt=""
      loading="lazy"
      sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...sx }}
    />
  );
  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        gap: "2px",
        height: shown.length === 1 ? 180 : 120,
        gridTemplateColumns: shown.length === 1 ? "1fr" : shown.length === 2 ? "1fr 1fr" : "2fr 1fr",
        gridTemplateRows: shown.length === 3 ? "1fr 1fr" : "1fr",
        overflow: "hidden",
      }}
    >
      {shown.map((img, i) => (
        <Box key={img.url + i} sx={{ gridRow: shown.length === 3 && i === 0 ? "1 / 3" : undefined, minHeight: 0 }}>
          {tile(img.url)}
        </Box>
      ))}
      {extra > 0 && (
        <Chip
          size="small"
          label={`+${extra}`}
          sx={{ position: "absolute", right: 6, bottom: 6, bgcolor: "background.paper" }}
        />
      )}
    </Box>
  );
}

/** One note on the board: its content for its type, progress, labels, and quick actions. */
export default function NoteCard({ note, onOpen, onToggleItem, onTogglePin, onToggleArchive, onColor }: NoteCardProps) {
  const theme = useTheme();
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const full = "can_edit" in note ? note : null;
  const pinned = full?.pinned ?? false;
  const archived = full?.archived ?? false;
  const editable = !!full?.can_edit;
  const items = note.checklist;
  const lines = note.body.split("\n");
  const progress = checklistProgress(items);
  const hasPhotos = note.images.length > 0;

  const content = (
    <Box>
      {hasPhotos && <PhotoMosaic images={note.images} />}
      <Box sx={{ p: 2, pb: editable || full?.updated_by_name ? 1 : 2 }}>
        {note.title && (
          <Typography sx={{ fontWeight: 600, mb: 0.5, wordBreak: "break-word", pr: editable ? 3 : 0 }}>
            {note.title}
          </Typography>
        )}

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
            {progress.total > 0 && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={(progress.done / progress.total) * 100}
                  aria-label="Checklist progress"
                  sx={{ flex: 1, height: 4, borderRadius: 2 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {progress.done} of {progress.total}
                </Typography>
              </Box>
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

        {full?.updated_by_name && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Updated by {full.updated_by_name}
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Card
      variant="outlined"
      sx={[
        {
          position: "relative",
          breakInside: "avoid",
          mb: 2,
          overflow: "hidden",
          // The action row shows on hover or keyboard focus, and always on touch screens (no hover there).
          "& .note-actions": { opacity: 0, transition: "opacity 120ms" },
          "&:hover .note-actions, &:focus-within .note-actions": { opacity: 1 },
          "@media (hover: none)": { "& .note-actions": { opacity: 1 } },
        },
        noteSurfaceSx(note.color),
      ]}
    >
      {onOpen ? <CardActionArea onClick={onOpen}>{content}</CardActionArea> : content}
      {editable && (
        <Box className="note-actions" sx={{ display: "flex", justifyContent: "flex-end", px: 0.5, pb: 0.5 }}>
          <Tooltip title="Colour">
            <IconButton size="small" aria-label="Colour" onClick={(e) => setColorAnchor(e.currentTarget)}>
              <PaletteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={pinned ? "Unpin" : "Pin"}>
            <IconButton size="small" aria-label={pinned ? "Unpin" : "Pin"} onClick={onTogglePin}>
              {pinned ? <PushPinIcon fontSize="small" color="primary" /> : <PushPinOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={archived ? "Unarchive" : "Archive"}>
            <IconButton size="small" aria-label={archived ? "Unarchive" : "Archive"} onClick={onToggleArchive}>
              {archived ? <UnarchiveOutlinedIcon fontSize="small" /> : <ArchiveOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
      <Menu anchorEl={colorAnchor} open={!!colorAnchor} onClose={() => setColorAnchor(null)}>
        <Box sx={{ display: "flex", gap: 1, p: 1.5 }} role="group" aria-label="Note colour">
          {NOTE_COLORS.map((c) => {
            const main = swatchColor(theme, c);
            return (
              <IconButton
                key={c}
                size="small"
                aria-label={NOTE_COLOR_LABELS[c]}
                onClick={() => {
                  onColor?.(c);
                  setColorAnchor(null);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  border: 2,
                  borderColor: note.color === c ? "text.primary" : "divider",
                  bgcolor: main ?? "background.paper",
                }}
              />
            );
          })}
        </Box>
      </Menu>
    </Card>
  );
}
