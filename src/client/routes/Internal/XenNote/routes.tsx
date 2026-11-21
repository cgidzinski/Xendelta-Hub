import { Navigate, Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenNote = lazyPage(() => import("./XenNote"));
const XenNoteLayout = lazyPage(() => import("./XenNoteLayout"));
const TasksView = lazyPage(() => import("./notebook/TasksView"));
const GraphView = lazyPage(() => import("./notebook/GraphView"));
const NotebookView = lazyPage(() => import("./notebook/NotebookView"));
const PageRedirect = lazyPage(() => import("./notebook/PageRedirect"));
const XenNoteSharedNote = lazyPage<object>(() =>
  import("./XenNoteShared").then((m) => ({ default: m.XenNoteSharedNote })),
);
const XenNoteSharedNotebook = lazyPage<object>(() =>
  import("./XenNoteShared").then((m) => ({ default: m.XenNoteSharedNotebook })),
);

// XenNote: routes mounted under /internal by main.tsx.
export const xennoteRoutes = (
  <>
    <Route path="xennote" element={<XenNoteLayout />}>
      <Route index element={<XenNote />} />
      <Route path="tasks" element={<TasksView />} />
      <Route path="graph" element={<GraphView />} />
      <Route path="b/:notebookId/tasks" element={<NotebookView tool="tasks" />} />
      <Route path="b/:notebookId/graph" element={<NotebookView tool="graph" />} />
      <Route path="b/:notebookId" element={<NotebookView />} />
      <Route path="b/:notebookId/p/:pageId" element={<NotebookView />} />
      <Route path="b/:notebookId/t/:tag" element={<NotebookView />} />
      <Route path="shared-pages" element={<Navigate to="/internal/xennote" replace />} />
      <Route path="p/:pageId" element={<PageRedirect />} />
    </Route>
    {/* A public link opened by a signed-in person who is not a member: read-only, but inside the app */}
    <Route path="xennote/shared/:token" element={<XenNoteSharedNote />} />
    <Route path="xennote/shared/b/:token" element={<XenNoteSharedNotebook />} />
  </>
);
