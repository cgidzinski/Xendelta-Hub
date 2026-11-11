import { Navigate, Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const XenBudgetBooksList = lazyPage(() => import("./BooksList"));
const XenBudgetBookDetail = lazyPage(() => import("./BookDetail"));
const XenBudgetBookOverview = lazyPage(() => import("./BookOverview"));
const XenBudgetBookItems = lazyPage(() => import("./BookItems"));
const XenBudgetBookPiggyBanks = lazyPage(() => import("./BookPiggyBanks"));
const XenBudgetBookReport = lazyPage(() => import("./BookReport"));
const XenBudgetBookSettings = lazyPage(() => import("./BookSettings"));
const SettingsIndexRedirect = lazyPage(() => import("./settings/SettingsIndexRedirect"));
const XenBudgetGeneralSection = lazyPage(() => import("./settings/GeneralSection"));
const XenBudgetCategoriesSection = lazyPage(() => import("./settings/CategoriesSection"));
const XenBudgetFlagsSection = lazyPage(() => import("./settings/FlagsSection"));
const XenBudgetTaggingSection = lazyPage(() => import("./settings/TaggingSection"));
const XenBudgetBudgetsSection = lazyPage(() => import("./settings/BudgetsSection"));
const XenBudgetCsvMapsSection = lazyPage(() => import("./settings/CsvMapsSection"));
const XenBudgetImportsSection = lazyPage(() => import("./settings/ImportsSection"));

// XenBudget: routes mounted under /internal by main.tsx.
export const xenbudgetRoutes = (
  <>
    <Route path="xenbudget">
      <Route index element={<Navigate to="books" replace />} />
      <Route path="books" element={<XenBudgetBooksList />} />
      <Route path="books/:bookId" element={<XenBudgetBookDetail />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<XenBudgetBookOverview />} />
        <Route path="items" element={<XenBudgetBookItems />} />
        <Route path="piggy-banks" element={<XenBudgetBookPiggyBanks />} />
        <Route path="report" element={<XenBudgetBookReport />} />
        <Route path="settings" element={<XenBudgetBookSettings />}>
          <Route index element={<SettingsIndexRedirect />} />
          <Route path="general" element={<XenBudgetGeneralSection />} />
          <Route path="categories" element={<XenBudgetCategoriesSection />} />
          <Route path="flags" element={<XenBudgetFlagsSection />} />
          <Route path="tagging" element={<XenBudgetTaggingSection />} />
          <Route path="budgets" element={<XenBudgetBudgetsSection />} />
          <Route path="csv-maps" element={<XenBudgetCsvMapsSection />} />
          <Route path="imports" element={<XenBudgetImportsSection />} />
        </Route>
      </Route>
    </Route>
  </>
);
