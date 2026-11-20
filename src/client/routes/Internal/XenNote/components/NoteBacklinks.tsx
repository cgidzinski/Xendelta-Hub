import { Box, Chip, Typography } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import { useXenNoteBacklinks, useXenNoteMentions } from "../../../../hooks/xennote/useXenNote";

interface NoteBacklinksProps {
  noteId: string;
  onOpenNote: (id: string) => void;
}

/** "Linked from": the other notes whose [[links]] point at this one. */
export default function NoteBacklinks({ noteId, onOpenNote }: NoteBacklinksProps) {
  const { data: backlinks = [] } = useXenNoteBacklinks(noteId);
  const { data: mentions = [] } = useXenNoteMentions(noteId);
  if (!backlinks.length && !mentions.length) return null;
  return (
    <Box>
      {!!backlinks.length && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Linked from
          </Typography>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
            {backlinks.map((b) => (
              <Chip
                key={b._id}
                size="small"
                variant="outlined"
                icon={<LinkIcon />}
                label={b.title.trim() || "Untitled note"}
                onClick={() => onOpenNote(b._id)}
              />
            ))}
          </Box>
        </Box>
      )}
      {!!mentions.length && (
        <Box sx={{ mt: backlinks.length ? 2 : 0 }}>
          <Typography variant="caption" color="text.secondary">
            Unlinked references
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 0.5 }}>
            {mentions.map((note) => (
              <Box key={note._id}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={note.title || "Untitled note"}
                  onClick={() => onOpenNote(note._id)}
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {note.snippet}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
