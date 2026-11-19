import { Box, Chip, Typography } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import { useXenNoteBacklinks } from "../../../../hooks/xennote/useXenNote";

interface NoteBacklinksProps {
  noteId: string;
  onOpenNote: (id: string) => void;
}

/** "Linked from": the other notes whose [[links]] point at this one. */
export default function NoteBacklinks({ noteId, onOpenNote }: NoteBacklinksProps) {
  const { data: backlinks = [] } = useXenNoteBacklinks(noteId);
  if (backlinks.length === 0) return null;
  return (
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
  );
}
