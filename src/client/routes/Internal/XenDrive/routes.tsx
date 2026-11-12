import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";
import { DriveBrowseLayout, DriveShell } from "./components/DriveShell";

const XenDrive = lazyPage(() => import("./XenDrive"));
const FileDetail = lazyPage(() => import("./FileDetail"));

// XenDrive: routes mounted under /internal by main.tsx. The shell keeps uploads running while you move around.
export const xendriveRoutes = (
  <Route path="xendrive" element={<DriveShell />}>
    <Route element={<DriveBrowseLayout />}>
      <Route index element={<XenDrive />} />
      <Route path="folder/:folderId" element={<XenDrive />} />
      <Route path="shared" element={<XenDrive view="shared" />} />
      <Route path="recent" element={<XenDrive view="recent" />} />
    </Route>
    <Route path="file/:fileId" element={<FileDetail />} />
  </Route>
);
