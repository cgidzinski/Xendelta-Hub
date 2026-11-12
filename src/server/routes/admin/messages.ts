import express = require("express");
import { Conversation } from "../../models/conversation";
import { Message } from "../../models/message";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { realtime } from "../../realtime";

module.exports = function (app: express.Application) {
  // Admin broadcast messages functionality removed - system user no longer exists

  app.delete(
    "/api/admin/messages/all",
    authenticateToken,
    requireAdmin,
    async function (_req: express.Request, res: express.Response) {
      const allConversations = await Conversation.find({}, "members.user_id").lean().exec();
      const messagesDeleted = (await Message.deleteMany({}).exec()).deletedCount;
      await Conversation.deleteMany({}).exec();

      // Tell everyone who was in a conversation that it is gone.
      for (const conversation of allConversations) {
        realtime.toUsers(
          conversation.members.map((m) => m.user_id),
          "chat:conversation",
          { conversationId: String(conversation._id), removed: true },
        );
      }

      return res.json({
        status: true,
        message: `Deleted ${messagesDeleted} messages and ${allConversations.length} conversations`,
        data: {
          messagesDeleted,
          conversationsDeleted: allConversations.length,
        },
      });
    },
  );
};
