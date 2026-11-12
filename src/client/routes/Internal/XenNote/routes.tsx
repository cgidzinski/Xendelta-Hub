import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenNote = lazyPage(() => import("./XenNote"));

// XenNote: routes mounted under /internal by main.tsx.
export const xennoteRoutes = (
  <>
    <Route path="xennote" element={<XenNote />} />
  </>
);
