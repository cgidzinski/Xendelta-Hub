import { registerSpaceRoutes } from "./spaces";
import { registerSpaceMemberRoutes } from "./members";

// Spaces: a group's own place with channels, roles and members (models/space.ts). The rules live in
// spaces/policy.ts and the shared pieces in spaces/service.ts. Routes here only validate, call those and answer.
// API keys cannot reach /api/spaces (shared/apiKeys.ts lists the apps they can).
module.exports = function (app: any) {
  registerSpaceRoutes(app);
  registerSpaceMemberRoutes(app);
};
