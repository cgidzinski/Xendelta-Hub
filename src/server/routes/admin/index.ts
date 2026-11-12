import { registerAdminOverviewRoutes } from "./overview";
import { registerAdminUserRoutes } from "./users";
import { registerAdminStorageRoutes } from "./storage";
import { registerAdminMoneyRoutes } from "./money";
import { registerAdminMessagingRoutes } from "./messaging";
import { registerAdminSystemRoutes } from "./system";
import { registerAdminBackupRoutes } from "./backups";
import { registerAdminAuditRoutes } from "./audit";
import { registerAdminBlogRoutes } from "./blog";
import { registerAdminDebugRoutes } from "./debug";

// The admin API, one file per page of the admin area (docs/adding-a-sub-app.md describes the route-folder pattern).
// Every route is behind authenticateToken + requireAdmin; API keys can't reach /api/admin (shared/apiKeys.ts).
// Every route that changes something calls recordAudit (utils/adminAudit.ts).
module.exports = function (app: any) {
  registerAdminOverviewRoutes(app);
  registerAdminUserRoutes(app);
  registerAdminStorageRoutes(app);
  registerAdminMoneyRoutes(app);
  registerAdminMessagingRoutes(app);
  registerAdminSystemRoutes(app);
  registerAdminBackupRoutes(app);
  registerAdminAuditRoutes(app);
  registerAdminBlogRoutes(app);
  registerAdminDebugRoutes(app);
};
