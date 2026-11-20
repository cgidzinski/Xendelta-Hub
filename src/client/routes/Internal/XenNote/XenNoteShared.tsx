import { useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, Stack } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useTitle } from "../../../hooks/useTitle";
import { SharedNotebookReader, SharedPageReader } from "../../External/XenNotePublic/SharedPageReader";
import { usePublicNote, usePublicNotebook } from "../../../hooks/xennote/useXenNote";
import NoteCard from "./components/NoteCard";

const GONE = "This link doesn't work any more. Ask the person who shared it for a new one.";

function OpenXenNote() {
  const navigate = useNavigate();
  return (
    <Button variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => navigate("/internal/xennote")}>
      My notes
    </Button>
  );
}

/**
 * A note someone shared by link, opened by a signed-in person who is not a member of its notebook. It sits inside the
 * app (with its menus) but is read-only: the link lets you read, never change.
 */
export function XenNoteSharedNote() {
  const { token } = useParams<{ token: string }>();
  const { data: note, isLoading, isError } = usePublicNote(token);
  useTitle(note?.title ? `${note.title} - XenNote` : "Shared note - XenNote");

  if (isLoading) {
    return (
      <PageContainer width="narrow">
        <ListSkeleton rows={3} />
      </PageContainer>
    );
  }
  if (isError || !note) {
    return (
      <PageContainer width="narrow">
        <Alert severity="error">{GONE}</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer width="narrow">
      <PageHeader
        title={note.title.trim() || "Shared note"}
        subtitle="Shared with you by link. You can read it but not change it."
        actions={<OpenXenNote />}
      />
      <NoteCard note={note} />
    </PageContainer>
  );
}

/** A notebook someone shared by link, opened by a signed-in person who is not in it: its notes, read-only. */
export function XenNoteSharedNotebook() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = usePublicNotebook(token);
  useTitle(data ? `${data.notebook.name} - XenNote` : "Shared notebook - XenNote");

  if (isLoading) {
    return (
      <PageContainer>
        <ListSkeleton rows={4} />
      </PageContainer>
    );
  }
  if (isError || !data) {
    return (
      <PageContainer>
        <Alert severity="error">{GONE}</Alert>
      </PageContainer>
    );
  }
  if (data.sections.length) return <SharedNotebookReader data={data} signedIn />;
  return (
    <PageContainer>
      <PageHeader
        title={data.notebook.name}
        subtitle={`Shared with you by link · ${data.notes.length} ${data.notes.length === 1 ? "note" : "notes"} · read-only`}
        actions={<OpenXenNote />}
      />
      {data.notes.length === 0 ? (
        <EmptyState title="Nothing here yet" description="There are no notes in this notebook yet." />
      ) : (
        <Box sx={{ columnCount: { xs: 1, sm: 2, md: 3 }, columnGap: 2 }}>
          {data.notes.map((n) => (
            <Stack key={n._id} sx={{ breakInside: "avoid" }}>
              <NoteCard note={n} />
            </Stack>
          ))}
        </Box>
      )}
    </PageContainer>
  );
}

export function XenNoteSharedPublicPage() {
  const { token } = useParams<{ token: string }>();
  return <SharedPageReader token={token} signedIn />;
}
