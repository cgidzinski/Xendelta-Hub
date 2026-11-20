import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenStart = lazyPage(() => import("./XenStart"));

export const xenstartRoutes = <Route path="xenstart" element={<XenStart />} />;
