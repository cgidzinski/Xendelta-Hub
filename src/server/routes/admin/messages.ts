import express = require("express");
const { User } = require("../../models/user");
const Conversation = require("../../models/conversation");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { SocketManager } from "../../infrastructure/SocketManager";
import { validate, adminBroadcastMessageSchema } from "../../utils/validation";
import { getLastMessageInfo } from "../../utils/conversationUtils";

module.exports = function (app: express.Application) {
  app.post("/api/admin/messages/all", authenticateToken, requireAdmin, validate(adminBroadcastMessageSchema), async function (req: express.Request, res: express.Response) {
    const { message, conversationTitle } = req.body;
    const adminUser = (req as any).adminUser;

    if (!message) {
      return res.status(400).json({
        status: false,
        message: "Message content is required",
      });
    }

    // Find System bot user
    const systemBot = await User.findOne({ username: "System", roles: "bot" }).exec();
    if (!systemBot) {
      return res.status(500).json({
        status: false,
        message: "System bot user not found",
      });
    }

    const systemBotId = systemBot._id.toString();
    const allUsers = await User.find({}).exec();
    let successCount = 0;
    let errorCount = 0;

    for (const targetUser of allUsers) {
      // Skip the System bot itself
      if (targetUser._id.toString() === systemBotId) {
        continue;
      }

      // Determine the conversation title to use
      const conversationTitleToUse = conversationTitle || "System Messages";
      
      // Find or create conversation with System bot for this user
      // Match by both participants AND conversation title
      let systemConversation = await Conversation.findOne({
        participants: { $all: [targetUser._id.toString(), systemBotId], $size: 2 },
        name: conversationTitleToUse
      }).exec();

      // Create the message object
      const newMessage = {
        from: systemBotId,
        message: message,
        time: new Date().toISOString(),
      };

      if (!systemConversation) {
        // Create new conversation with System bot
        systemConversation = new Conversation({
          participants: [targetUser._id.toString(), systemBotId],
          canReply: false, // System bot conversations are not replyable
          createdBy: systemBotId, // System bot is the creator
          name: conversationTitleToUse, // Use provided title or default
          updatedAt: new Date().toISOString(),
          messages: [newMessage],
        });
        await systemConversation.save();

        // Add conversation metadata to target user
        if (!targetUser.conversations) {
          targetUser.conversations = [];
        }
        targetUser.conversations.push({
          conversationId: systemConversation._id,
          unread: true,
          lastReadAt: undefined,
        });
        targetUser.markModified('conversations');
        await targetUser.save();

        // Add conversation metadata to System bot
        if (!systemBot.conversations) {
          systemBot.conversations = [];
        }
        systemBot.conversations.push({
          conversationId: systemConversation._id,
          unread: false,
          lastReadAt: undefined,
        });
        systemBot.markModified('conversations');
        await systemBot.save();

        // Notify user about new conversation
        const socketManager = SocketManager.getInstance();
        const lastMessageInfo = getLastMessageInfo(systemConversation);
        socketManager.notifyNewConversation(targetUser._id.toString(), {
          _id: systemConversation._id.toString(),
          participants: systemConversation.participants,
          name: systemConversation.name,
          canReply: systemConversation.canReply,
          lastMessage: lastMessageInfo.lastMessage,
          lastMessageTime: lastMessageInfo.lastMessageTime,
          unread: true,
          updatedAt: systemConversation.updatedAt,
        });
      } else {
        // Add message to existing conversation
        if (!systemConversation.messages) {
          systemConversation.messages = [];
        }
        systemConversation.messages.push(newMessage);
        systemConversation.updatedAt = new Date().toISOString();
        systemConversation.markModified('messages');
        await systemConversation.save();

        // Update unread status for target user
        const userConvMetadata = (targetUser.conversations || []).find((uc: any) => uc.conversationId.toString() === systemConversation._id.toString());
        if (userConvMetadata) {
          userConvMetadata.unread = true;
          targetUser.markModified('conversations');
          await targetUser.save();
        } else {
          // Add conversation metadata if it doesn't exist
          if (!targetUser.conversations) {
            targetUser.conversations = [];
          }
          targetUser.conversations.push({
            conversationId: systemConversation._id,
            unread: true,
            lastReadAt: undefined,
          });
          targetUser.markModified('conversations');
          await targetUser.save();
        }
      }
      
      // Send socket notification to user
      const socketManager = SocketManager.getInstance();
      const messageWithUsername = {
        ...newMessage,
        senderUsername: "System",
      };
      socketManager.sendNewMessage(systemConversation._id.toString(), messageWithUsername, systemConversation.participants);
      
      successCount++;
    }

    return res.json({
      status: true,
      message: `Message sent to ${successCount} users${errorCount > 0 ? `, ${errorCount} errors` : ""}`,
      data: {
        successCount,
        errorCount,
      },
    });
  });

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

