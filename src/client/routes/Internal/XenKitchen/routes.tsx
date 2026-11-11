import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenKitchen = lazyPage(() => import("./XenKitchen"));
const XenKitchenItemDetail = lazyPage(() => import("./ItemDetail"));

// XenKitchen: routes mounted under /internal by main.tsx.
export const xenkitchenRoutes = (
  <>
    <Route path="xenkitchen" element={<XenKitchen />} />
    <Route path="xenkitchen/:id" element={<XenKitchenItemDetail />} />
  </>
);
