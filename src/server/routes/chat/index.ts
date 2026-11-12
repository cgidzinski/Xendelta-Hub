import { registerConversationRoutes } from "./conversations";
import { registerMessageRoutes } from "./messages";
import { registerMemberRoutes } from "./members";

// Chat: every conversation is a group, and a conversation with two members is a DM (see models/conversation.ts).
// The rules live in chat/policy.ts and the shared pieces in chat/service.ts. Routes here only validate, call those
// and answer. API keys cannot reach /api/chat (shared/apiKeys.ts lists the apps they can).
module.exports = function (app: any) {
  registerConversationRoutes(app);
  registerMessageRoutes(app);
  registerMemberRoutes(app);
};
