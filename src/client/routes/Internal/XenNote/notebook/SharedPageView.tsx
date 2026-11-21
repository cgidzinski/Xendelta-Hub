import { useNavigate, useParams } from "react-router-dom";
import PageContainer from "../../../../components/ui/PageContainer";
import PageView from "./PageView";

/** A page opened from a link by someone who was added to it, not to its notebook: just the page, no notebook around it. */
export default function SharedPageView() {
  const { pageId = "" } = useParams();
  const navigate = useNavigate();
  return (
    <PageContainer width="narrow">
      <PageView key={pageId} pageId={pageId} onGone={() => navigate("/internal/xennote")} />
    </PageContainer>
  );
}
