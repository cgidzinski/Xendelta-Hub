import { Navigate, useParams } from "react-router-dom";
import { useXenNotePage } from "../../../../hooks/xennote/usePages";
import PageContainer from "../../../../components/ui/PageContainer";
import PageHeader from "../../../../components/ui/PageHeader";
import DetailSkeleton from "../../../../components/ui/DetailSkeleton";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import NoteNavButton from "../components/NoteNavButton";

/** Existing page links, including reminders, resolve to their notebook for its members. */
export default function PageRedirect() {
  const { pageId } = useParams();
  const { data, isPending, error, refetch } = useXenNotePage(pageId);

  if (data?.notebook) {
    return <Navigate to={`/internal/xennote/b/${data.notebook.id}/p/${data.page.id}`} replace />;
  }

  return (
    <PageContainer>
      <PageHeader title="Page" leading={<NoteNavButton />} />
      {isPending ? (
        <DetailSkeleton height={360} />
      ) : (
        <ErrorDisplay error={error} title="Couldn't open this page" onRetry={() => refetch()} />
      )}
    </PageContainer>
  );
}
