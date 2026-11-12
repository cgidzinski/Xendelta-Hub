import { useParams } from "react-router-dom";
import { Alert, Box, CircularProgress, Container, Typography } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import { usePublicNote, usePublicNotebook } from "../../../hooks/xennote/useXenNote";
import NoteCard from "../../Internal/XenNote/components/NoteCard";

const GONE = "This link doesn't work any more. Ask the person who shared it for a new one.";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      {children}
    </Container>
  );
}

/** One shared note, opened from its public link (read-only). */
export function XenNotePublicNote() {
  const { token } = useParams<{ token: string }>();
  const { data: note, isLoading, isError } = usePublicNote(token);
  useTitle(note?.title ? `${note.title} - XenNote` : "Shared note - XenNote");

  if (isLoading) {
    return (
      <Frame>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      </Frame>
    );
  }
  if (isError || !note) {
    return (
      <Frame>
        <Alert severity="error">{GONE}</Alert>
      </Frame>
    );
  }
  return (
    <Frame>
      <Box sx={{ maxWidth: 560, mx: "auto" }}>
        <NoteCard note={note} />
      </Box>
    </Frame>
  );
}

/** A shared notebook, opened from its public link: its notes, read-only. */
export function XenNotePublicNotebook() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = usePublicNotebook(token);
  useTitle(data ? `${data.notebook.name} - XenNote` : "Shared notebook - XenNote");

  if (isLoading) {
    return (
      <Frame>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      </Frame>
    );
  }
  if (isError || !data) {
    return (
      <Frame>
        <Alert severity="error">{GONE}</Alert>
      </Frame>
    );
  }
  return (
    <Frame>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        {data.notebook.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        A shared notebook · {data.notes.length} {data.notes.length === 1 ? "note" : "notes"}
      </Typography>
      {data.notes.length === 0 ? (
        <Typography color="text.secondary">There are no notes in this notebook yet.</Typography>
      ) : (
        <Box sx={{ columnCount: { xs: 1, sm: 2, md: 3 }, columnGap: 2 }}>
          {data.notes.map((n) => (
            <NoteCard key={n._id} note={n} />
          ))}
        </Box>
      )}
      <Box sx={{ mt: 3, p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary">
          You are reading a shared notebook. You cannot change it, and you cannot see who else is in it.
        </Typography>
      </Box>
    </Frame>
  );
}
