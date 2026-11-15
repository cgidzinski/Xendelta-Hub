import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const Storage = lazyPage(() => import("./Storage"));
const StorageFile = lazyPage(() => import("./StorageFile"));

// The storage viewer: files apps stored for the person. Mounted under /internal by main.tsx.
export const storageRoutes = (
  <Route path="storage">
    <Route index element={<Storage />} />
    <Route path="file/:fileId" element={<StorageFile />} />
  </Route>
);
