import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenNote = lazyPage(() => import("./XenNote"));
const XenNoteSharedNote = lazyPage<object>(() =>
  import("./XenNoteShared").then((m) => ({ default: m.XenNoteSharedNote })),
);
const XenNoteSharedNotebook = lazyPage<object>(() =>
  import("./XenNoteShared").then((m) => ({ default: m.XenNoteSharedNotebook })),
);

// XenNote: routes mounted under /internal by main.tsx.
export const xennoteRoutes = (
  <>
    <Route path="xennote" element={<XenNote />} />
    {/* A public link opened by a signed-in person who is not a member: read-only, but inside the app */}
    <Route path="xennote/shared/:token" element={<XenNoteSharedNote />} />
    <Route path="xennote/shared/b/:token" element={<XenNoteSharedNotebook />} />
  </>
);
