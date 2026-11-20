import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenNote = lazyPage(() => import("./XenNote"));
// A notebook as sections and pages (opt-in for now), and a single page shared with someone who isn't in its notebook.
const NotebookView = lazyPage(() => import("./notebook/NotebookView"));
const SharedPageView = lazyPage(() => import("./notebook/SharedPageView"));
const XenNoteSharedNote = lazyPage<object>(() =>
  import("./XenNoteShared").then((m) => ({ default: m.XenNoteSharedNote })),
);
const XenNoteSharedPublicPage = lazyPage<object>(() =>
  import("./XenNoteShared").then((m) => ({ default: m.XenNoteSharedPublicPage })),
);
const XenNoteSharedNotebook = lazyPage<object>(() =>
  import("./XenNoteShared").then((m) => ({ default: m.XenNoteSharedNotebook })),
);

// XenNote: routes mounted under /internal by main.tsx.
export const xennoteRoutes = (
  <>
    <Route path="xennote" element={<XenNote />} />
    <Route path="xennote/b/:notebookId" element={<NotebookView />} />
    <Route path="xennote/b/:notebookId/p/:pageId" element={<NotebookView />} />
    <Route path="xennote/b/:notebookId/t/:tag" element={<NotebookView />} />
    <Route path="xennote/p/:pageId" element={<SharedPageView />} />
    {/* A public link opened by a signed-in person who is not a member: read-only, but inside the app */}
    <Route path="xennote/shared/:token" element={<XenNoteSharedNote />} />
    <Route path="xennote/shared/p/:token" element={<XenNoteSharedPublicPage />} />
    <Route path="xennote/shared/b/:token" element={<XenNoteSharedNotebook />} />
  </>
);
