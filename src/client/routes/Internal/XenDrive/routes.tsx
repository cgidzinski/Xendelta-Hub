import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenDrive = lazyPage(() => import("./XenDrive"));
const FileDetail = lazyPage(() => import("./FileDetail"));

// XenDrive: routes mounted under /internal by main.tsx.
export const xendriveRoutes = (
  <>
    <Route path="xendrive" element={<XenDrive />} />
    <Route path="xendrive/:fileId" element={<FileDetail />} />
  </>
);
