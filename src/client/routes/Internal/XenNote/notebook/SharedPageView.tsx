import { useNavigate, useParams } from "react-router-dom";
import PageContainer from "../../../../components/ui/PageContainer";
import type { PageLinksValue } from "../editor/pageLinksContext";
import PageView from "./PageView";

/** A page opened from a link by someone who was added to it, not to its notebook: just the page, no notebook around it. */
export default function SharedPageView() {
  const { pageId = "" } = useParams();
  const navigate = useNavigate();
  // Without the notebook around it: links open other pages shared with the person, and nothing is made or tagged here.
  const links: PageLinksValue = {
    notebookId: null,
    onOpenPage: (id) => navigate(`/internal/xennote/p/${id}`),
    onOpenTag: () => undefined,
    onCreatePage: async () => null,
    tags: () => [],
  };
  return (
    <PageContainer width="narrow">
      <PageView key={pageId} pageId={pageId} onGone={() => navigate("/internal/xennote")} links={links} />
    </PageContainer>
  );
}
