import express = require("express");
const { User } = require("../../models/user");
const Conversation = require("../../models/conversation");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { SocketManager } from "../../infrastructure/SocketManager";
import { validate, adminBroadcastMessageSchema } from "../../utils/validation";
import { getLastMessageInfo } from "../../utils/conversationUtils";

module.exports = function (app: express.Application) {
  // Admin broadcast messages functionality removed - system user no longer exists

  app.delete("/api/admin/messages/all", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const allConversations = await Conversation.find({}).exec();
    let totalMessagesDeleted = 0;

    // Count total messages before deletion
    for (const conversation of allConversations) {
      if (conversation.messages && conversation.messages.length > 0) {
        totalMessagesDeleted += conversation.messages.length;
      }
    }

    // Delete all conversations
    await Conversation.deleteMany({}).exec();

    // Remove conversation references from all users
    const allUsers = await User.find({}).exec();
    for (const user of allUsers) {
      if (user.conversations && user.conversations.length > 0) {
        // Remove all conversation metadata
        user.conversations = [];
        user.markModified('conversations');
        await user.save();
      }
    }

    return res.json({
      status: true,
      message: `Deleted ${totalMessagesDeleted} messages and ${allConversations.length} conversations`,
      data: {
        messagesDeleted: totalMessagesDeleted,
        conversationsDeleted: allConversations.length,
      },
    });
  });
};

