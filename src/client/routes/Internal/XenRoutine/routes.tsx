import { Navigate, Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenRoutine = lazyPage(() => import("./XenRoutine"));
const XenRoutineOverview = lazyPage(() => import("./Overview"));
const XenRoutineRoutines = lazyPage(() => import("./Routines"));

// XenRoutine: routes mounted under /internal by main.tsx.
export const xenroutineRoutes = (
  <>
    <Route path="xenroutine" element={<XenRoutine />}>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<XenRoutineOverview />} />
      <Route path="routines" element={<XenRoutineRoutines />} />
    </Route>
  </>
);
