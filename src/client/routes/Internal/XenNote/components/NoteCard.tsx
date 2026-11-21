import {
  Box,
  Card,
  CardActionArea,
  Checkbox,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { formatDistanceToNowStrict } from "date-fns";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import LinkIcon from "@mui/icons-material/Link";
import NotesIcon from "@mui/icons-material/Notes";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import type { PublicXenNote, XenNote } from "../../../../types/XenNote";
import { checklistProgress, hostOf } from "../noteDraft";
import NoteMarkdown from "./NoteMarkdown";
import { noteSurfaceSx } from "../noteColors";
import { formatReminder } from "../reminders";

interface NoteCardProps {
  note: XenNote | PublicXenNote;
  onOpen?: () => void;
  /** Tick or untick checklist item `index` straight from the board. Omit for read-only. */
  onToggleItem?: (index: number) => void;
  onTogglePin?: () => void;
  /** The id of the note a [[title]] means (omit on a public page, where [[links]] are just their words). */
  resolveTitle?: (title: string) => string | null;
  /** Open a note a [[link]] points to. */
  onOpenLinked?: (id: string) => void;
  /**
   * Set while choosing notes for a bulk action: the card shows a tick box, and a tap ticks it instead of opening it.
   * A note the person can't edit shows no tick box and can't be chosen.
   */
  selected?: boolean;
  onSelect?: () => void;
}

const TYPE_ICON: Record<string, typeof NotesIcon> = {
  text: NotesIcon,
  checklist: CheckBoxOutlinedIcon,
  link: LinkIcon,
  image: ImageOutlinedIcon,
};

const MAX_LINES = 8;
const MAX_ITEMS = 6;

/** Up to three photos as a mosaic: one wide, two side by side, or a big one beside two small ones. */
function PhotoMosaic({ images }: { images: Array<{ url: string; thumbUrl?: string | null }> }) {
  const shown = images.slice(0, 3);
  const extra = images.length - shown.length;
  const tile = (img: { url: string; thumbUrl?: string | null }, sx: object = {}) => (
    <Box
      key={img.url}
      component="img"
      src={img.thumbUrl ?? img.url}
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
          {tile(img)}
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
export default function NoteCard({
  note,
  onOpen,
  onToggleItem,
  onTogglePin,
  resolveTitle,
  onOpenLinked,
  selected,
  onSelect,
}: NoteCardProps) {
  const full = "can_edit" in note ? note : null;
  const pinned = full?.pinned ?? false;
  const editable = !!full?.can_edit;
  const items = note.checklist;
  const lines = note.body.split("\n");
  const progress = checklistProgress(items);
  const hasPhotos = note.images.length > 0;

  const hasBody = !!note.body.trim() || items.length > 0 || (note.type === "link" && !!note.link.url) || hasPhotos;
  const activate = selected !== undefined ? (editable ? onSelect : undefined) : onOpen;
  const selecting = selected !== undefined;
  const TypeIcon = TYPE_ICON[note.type] ?? NotesIcon;
  const heading = note.title || (note.type === "link" ? note.link.title || hostOf(note.link.url) : "");
  const when = formatDistanceToNowStrict(new Date(note.updated_at), { addSuffix: true });
  const who = full?.owner_name ? `Shared by ${full.owner_name}` : null;
  const hasChips = note.labels.length > 0 || (full?.reminder && !full.reminder.sent);

  // The whole card is one target: a single invisible button behind the content opens the note (or ticks it while
  // selecting) and carries the hover, ripple and focus ring. The content sits above it and lets clicks fall through to
  // it, except for the pin, tick boxes, and links in the text.
  const passThrough = {
    position: "relative",
    pointerEvents: activate ? "none" : "auto",
    "& a, & button, & input, & .MuiCheckbox-root, & .MuiIconButton-root, & [role='button'], & [role='link']": {
      pointerEvents: "auto",
    },
  } as const;

  const titleRow = (
    <>
      <TypeIcon fontSize="small" sx={{ color: "text.secondary", flex: "none" }} />
      <Typography
        noWrap
        sx={{
          flex: 1,
          minWidth: 0,
          fontWeight: heading ? 600 : 400,
          fontStyle: heading ? "normal" : "italic",
          color: heading ? "text.primary" : "text.disabled",
          textAlign: "left",
        }}
      >
        {heading || "Untitled"}
      </Typography>
    </>
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
          opacity: selecting && !editable ? 0.5 : 1,
        },
        noteSurfaceSx(note.color),
        selected === undefined
          ? {}
          : {
              outline: 2,
              outlineStyle: selected ? "solid" : "none",
              outlineColor: "primary.main",
              ...(selected && {
                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  bgcolor: "action.selected",
                  pointerEvents: "none",
                },
              }),
            },
      ]}
    >
      {activate && (
        <CardActionArea
          onClick={activate}
          aria-label={`${selecting ? "Select" : "Open"} ${heading || "note"}`}
          sx={{ position: "absolute", inset: 0, zIndex: 0 }}
        />
      )}

      {hasPhotos && (
        <Box sx={passThrough}>
          <PhotoMosaic images={note.images} />
        </Box>
      )}

      {/* Header: type, title and the actions, in the same place on every card. */}
      <Box
        sx={{
          ...passThrough,
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 48,
          pl: 1.75,
          pr: 0.75,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>{titleRow}</Box>
        {selecting && editable && (
          <Checkbox
            checked={selected}
            onChange={onSelect}
            size="small"
            slotProps={{ input: { "aria-label": `Select ${note.title || "note"}` } }}
            sx={{ p: 0.75 }}
          />
        )}
        {!selecting && editable && (
          <Tooltip title={pinned ? "Unpin" : "Pin"}>
            <IconButton
              size="small"
              aria-label={pinned ? "Unpin" : "Pin"}
              aria-pressed={pinned}
              onClick={onTogglePin}
              sx={{ color: pinned ? "primary.main" : "text.secondary" }}
            >
              {pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={passThrough}>
        <Box sx={{ px: 1.75, py: 1.5, minHeight: 76, display: "flex", flexDirection: "column", gap: 1 }}>
          {!hasBody && (
            <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic" }}>
              Empty note
            </Typography>
          )}

          {note.type === "link" && note.link.url && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {hostOf(note.link.url)}
              </Typography>
              {note.link.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: "break-word" }}>
                  {note.link.description}
                </Typography>
              )}
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
              <>
                <NoteMarkdown
                  text={lines.slice(0, MAX_LINES).join("\n")}
                  resolve={resolveTitle}
                  onOpenNote={onOpenLinked}
                />
                {lines.length > MAX_LINES && (
                  <Typography variant="body2" color="text.secondary">
                    …
                  </Typography>
                )}
              </>
            )
          )}
        </Box>

        {/* Footer: when it changed and who by, then its labels and reminder. Always there, so cards stay the same shape. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            px: 1.75,
            py: 1,
            minHeight: 40,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
            {who ? `${who} · ` : ""}
            {when}
          </Typography>
          {hasChips && (
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {full?.reminder && !full.reminder.sent && (
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  icon={<NotificationsActiveIcon sx={{ fontSize: 14 }} />}
                  label={formatReminder(full.reminder.at)}
                />
              )}
              {note.labels.map((label) => (
                <Chip key={label} label={label} size="small" variant="outlined" />
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Card>
  );
}
