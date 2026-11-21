import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Box, CircularProgress, Container } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import PublicJoinCard from "../components/PublicJoinCard";
import { useAuth } from "../../../contexts/AuthContext";
import { usePublicNote, usePublicNotebook, useSharedLinkAccess } from "../../../hooks/xennote/useXenNote";
import { SharedNotebookReader } from "./SharedPageReader";
import NoteCard from "../../Internal/XenNote/components/NoteCard";

const GONE = "This link doesn't work any more. Ask the person who shared it for a new one.";

function Loading() {
  return (
    <Frame>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    </Frame>
  );
}

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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  // Signed in: a member goes to the note in the app (at their role), anyone else to the in-app read-only view.
  const access = useSharedLinkAccess("note", token, isAuthenticated);
  const { data: note, isLoading, isError } = usePublicNote(!isAuthenticated || access.isError ? token : undefined);
  useTitle(note?.title ? `${note.title} - XenNote` : "Shared note - XenNote");

  if (authLoading || (isAuthenticated && access.isLoading)) return <Loading />;
  if (isAuthenticated && access.data) {
    const to =
      access.data.access === "member"
        ? `/internal/xennote?note=${access.data.note_id}`
        : `/internal/xennote/shared/${token}`;
    return <Navigate to={to} replace />;
  }
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
      <Box sx={{ maxWidth: 560, mx: "auto" }}>
        <PublicJoinCard app="xennote" />
      </Box>
    </Frame>
  );
}

/** A shared notebook, opened from its public link: its pages, read-only. */
export function XenNotePublicNotebook() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const page = params.get("page");
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const access = useSharedLinkAccess("notebook", token, isAuthenticated);
  const { data, isLoading, isError } = usePublicNotebook(!isAuthenticated || access.isError ? token : undefined);
  useTitle(data ? `${data.notebook.name} - XenNote` : "Shared notebook - XenNote");

  if (authLoading || (isAuthenticated && access.isLoading)) return <Loading />;
  if (isAuthenticated && access.data) {
    const suffix = page && /^[a-f0-9]{24}$/i.test(page) ? `/p/${page}` : "";
    const notebook = access.data.notebook_id;
    const to =
      access.data.access === "link"
        ? `/internal/xennote/shared/b/${token}${page ? "?" + params.toString() : ""}`
        : `/internal/xennote/b/${notebook}${suffix}`;
    return <Navigate to={to} replace />;
  }
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
  return <SharedNotebookReader data={data} signedIn={isAuthenticated} />;
}

/** One notebook page opened by link, with a member's normal access when signed in. */
