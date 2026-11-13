import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenKitchen = lazyPage(() => import("./XenKitchen"));
const XenKitchenItemDetail = lazyPage(() => import("./ItemDetail"));
const XenKitchenMealPlan = lazyPage(() => import("./MealPlan"));

// XenKitchen: routes mounted under /internal by main.tsx.
export const xenkitchenRoutes = (
  <>
    <Route path="xenkitchen" element={<XenKitchen />} />
    {/* before :id, which would otherwise read "plan" as a recipe id */}
    <Route path="xenkitchen/plan" element={<XenKitchenMealPlan />} />
    <Route path="xenkitchen/:id" element={<XenKitchenItemDetail />} />
  </>
);
