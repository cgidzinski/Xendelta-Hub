import { Navigate, Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XensplitGroupsList = lazyPage(() => import("./GroupsList"));
const XensplitGroupDetail = lazyPage(() => import("./GroupDetail"));
const GroupOverview = lazyPage(() => import("./GroupOverview"));
const GroupExpenses = lazyPage(() => import("./GroupExpenses"));
const GroupBalances = lazyPage(() => import("./GroupBalances"));
const GroupSettlements = lazyPage(() => import("./GroupSettlements"));
const GroupAnalytics = lazyPage(() => import("./GroupAnalytics"));
const GroupExplain = lazyPage(() => import("./GroupExplain"));
const GroupSettings = lazyPage(() => import("./GroupSettings"));
const GroupActivityLog = lazyPage(() => import("./GroupActivityLog"));

// Xensplit: routes mounted under /internal by main.tsx.
export const xensplitRoutes = (
  <>
    <Route path="xensplit" index element={<Navigate to="groups" replace />} />
    <Route path="xensplit/groups" element={<XensplitGroupsList />} />
    <Route path="xensplit/groups/:groupId" element={<XensplitGroupDetail />}>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<GroupOverview />} />
      <Route path="expenses" element={<GroupExpenses />} />
      <Route path="balances" element={<GroupBalances />} />
      <Route path="settlements" element={<GroupSettlements />} />
      <Route path="analytics" element={<GroupAnalytics />} />
      <Route path="explain" element={<GroupExplain />} />
      <Route path="settings" element={<GroupSettings />} />
      <Route path="activity" element={<GroupActivityLog />} />
    </Route>
  </>
);
