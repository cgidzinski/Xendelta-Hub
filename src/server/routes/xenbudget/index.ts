import { authenticateToken } from "../../middleware/auth";
import { registerBookRoutes } from "./books";
import { registerLabelSectionRoutes } from "./labels";
import { registerRuleRoutes } from "./rules";
import { registerBackupRoutes } from "./backup";
import { registerImportRoutes } from "./importCsv";
import { registerBudgetRoutes } from "./budgets";
import { registerPiggyBankRoutes } from "./piggyBanks";
import { registerSummaryRoutes } from "./summary";
import { registerItemRoutes } from "./items";

module.exports = function (app: any) {
  // Auth for every XenBudget route
  app.use("/api/xenbudget", authenticateToken);
  registerBookRoutes(app);
  registerLabelSectionRoutes(app);
  registerRuleRoutes(app);
  registerBackupRoutes(app);
  registerImportRoutes(app);
  registerBudgetRoutes(app);
  registerPiggyBankRoutes(app);
  registerSummaryRoutes(app);
  registerItemRoutes(app);
};
