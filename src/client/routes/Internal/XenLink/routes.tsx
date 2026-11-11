import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenLink = lazyPage(() => import("./XenLink"));

// XenLink: routes mounted under /internal by main.tsx.
export const xenlinkRoutes = (
  <>
    <Route path="xenlink" element={<XenLink />} />
  </>
);
