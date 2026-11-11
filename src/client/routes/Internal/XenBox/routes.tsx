import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenBox = lazyPage(() => import("./XenBox"));
const FileDetail = lazyPage(() => import("./FileDetail"));

// XenBox: routes mounted under /internal by main.tsx.
export const xenboxRoutes = (
  <>
    <Route path="xenbox" element={<XenBox />} />
    <Route path="xenbox/:fileId" element={<FileDetail />} />
  </>
);
