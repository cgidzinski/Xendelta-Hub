import { useSnackbar } from "notistack";
import { Box, Button, Chip, Typography } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import { useLinkXenNoteMention, useXenNoteBacklinks, useXenNoteMentions } from "../../../../hooks/xennote/useXenNote";

interface NoteBacklinksProps {
  noteId: string;
  onOpenNote: (id: string) => void;
}

/** "Linked from": the other notes whose [[links]] point at this one. */
export default function NoteBacklinks({ noteId, onOpenNote }: NoteBacklinksProps) {
  const { data: backlinks = [] } = useXenNoteBacklinks(noteId);
  const linkMention = useLinkXenNoteMention(noteId);
  const { enqueueSnackbar } = useSnackbar();
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
              <Box key={note._id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={note.title || "Untitled note"}
                  onClick={() => onOpenNote(note._id)}
                />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {note.snippet}
                </Typography>
                {note.can_link && (
                  <Button
                    size="small"
                    disabled={linkMention.isPending}
                    onClick={() =>
                      linkMention.mutate(note._id, {
                        onError: (error) =>
                          enqueueSnackbar(error.message || "Couldn’t link the note", { variant: "error" }),
                      })
                    }
                  >
                    Link it
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
