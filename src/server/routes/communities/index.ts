import { registerCommunityRoutes } from "./communities";
import { registerCommunityMemberRoutes } from "./members";
import { registerChannelRoutes } from "./channels";
import { registerRoleRoutes } from "./roles";
import { registerInviteRoutes } from "./invites";

// Communities: a group's own place with channels, roles and members (models/community.ts). The rules live in
// communities/policy.ts and the shared pieces in communities/service.ts. Routes here only validate, call those and answer.
// API keys cannot reach /api/communities (shared/apiKeys.ts lists the apps they can).
module.exports = function (app: any) {
  registerCommunityRoutes(app);
  registerCommunityMemberRoutes(app);
  registerChannelRoutes(app);
  registerRoleRoutes(app);
  registerInviteRoutes(app);
};
