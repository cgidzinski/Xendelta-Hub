import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const TimerLayout = lazyPage(() => import("./timers/TimerLayout"));
const XenKitchen = lazyPage(() => import("./XenKitchen"));
const XenKitchenItemDetail = lazyPage(() => import("./ItemDetail"));
const XenKitchenMealPlan = lazyPage(() => import("./MealPlan"));

// XenKitchen: routes mounted under /internal by main.tsx.
export const xenkitchenRoutes = (
  <Route path="xenkitchen" element={<TimerLayout />}>
    <Route index element={<XenKitchen />} />
    <Route path="plan" element={<XenKitchenMealPlan />} />
    <Route path=":id" element={<XenKitchenItemDetail />} />
  </Route>
);
