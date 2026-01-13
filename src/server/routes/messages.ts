import express = require("express");
const { User } = require("../models/user");
const Conversation = require("../models/conversation");
import { authenticateToken } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { SocketManager } from "../infrastructure/SocketManager";
import {
  validate,
  validateParams,
  sendMessageSchema,
  createConversationSchema,
  updateConversationNameSchema,
  addParticipantsSchema,
  conversationIdParamSchema,
  messageIdParamSchema,
  participantIdParamSchema,
} from "../utils/validation";
import { UserConversationMetadata, Message, ConversationDocument, AuthenticatedRequest } from "../types";
import { getLastMessageInfo, generateDefaultConversationName } from "../utils/conversationUtils";


module.exports = function (app: express.Application) {
  // Get all conversations for the authenticated user
  app.get("/api/user/messages", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();
    
    // Get conversation IDs from user's conversation metadata
    const userConversationIds = (user.conversations || []).map((uc: UserConversationMetadata) => uc.conversationId);
    
    // Find all conversations where user is a participant
    const conversations = await Conversation.find({
      _id: { $in: userConversationIds },
      participants: user._id.toString()
    }).exec();

    // Create a map of conversation metadata for quick lookup
    const conversationMetadataMap = new Map<string, UserConversationMetadata>();
    (user.conversations || []).forEach((uc: UserConversationMetadata) => {
      conversationMetadataMap.set(uc.conversationId.toString(), uc);
    });

    // Format conversations for response with participant usernames
    const formattedConversations = await Promise.all(conversations.map(async (conv: ConversationDocument) => {
      // Fetch usernames for participants
      const participantInfo = await Promise.all(
        conv.participants.map(async (p: string) => {
          if (p === user._id.toString()) {
            return { _id: user._id.toString(), username: user.username, avatar: user.avatar || "/avatars/default-avatar.png" };
          }
          const participantUser = await User.findOne({ _id: p }).select("username _id avatar").exec();
          return participantUser ? { _id: participantUser._id.toString(), username: participantUser.username, avatar: participantUser.avatar || "/avatars/default-avatar.png" } : { _id: p, username: "Unknown", avatar: "/avatars/default-avatar.png" };
        })
      );
      
      const metadata = conversationMetadataMap.get(conv._id.toString()) || { unread: false };
      const lastMessageInfo = getLastMessageInfo(conv);
      
      // Generate default name if no name is set
      const conversationName = conv.name || generateDefaultConversationName(participantInfo);
      
      return {
        _id: conv._id.toString(),
        participants: conv.participants,
        participantInfo: participantInfo,
        name: conversationName,
        createdBy: conv.createdBy,
        lastMessage: lastMessageInfo.lastMessage,
        lastMessageTime: lastMessageInfo.lastMessageTime,
        unread: metadata.unread || false,
        updatedAt: conv.updatedAt,
        messageCount: (conv.messages || []).length,
      };
    }));

    return res.json({
      status: true,
      data: { conversations: formattedConversations },
    });
  });

  // Get a specific conversation with all messages
  app.get("/api/user/messages/:conversationId", authenticateToken, validateParams(conversationIdParamSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId } = req.params;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to view this conversation",
      });
    }

    // Fetch usernames for participants and message senders
    const participantInfo = await Promise.all(
      conversation.participants.map(async (p: string) => {
        if (p === user._id.toString()) {
          return { _id: user._id.toString(), username: user.username, avatar: user.avatar || "/avatars/default-avatar.png" };
        }
        const participantUser = await User.findOne({ _id: p }).select("username _id avatar").exec();
        return participantUser ? { _id: participantUser._id.toString(), username: participantUser.username, avatar: participantUser.avatar || "/avatars/default-avatar.png" } : { _id: p, username: "Unknown", avatar: "/avatars/default-avatar.png" };
      })
    );

    // Add username to each message
    const messagesWithUsernames = await Promise.all(
      (conversation.messages || []).map(async (msg: Message) => {
        if (msg.from === user._id.toString()) {
          return {
            ...(msg.toObject ? msg.toObject() : msg),
            senderUsername: user.username,
          };
        }
        const senderUser = await User.findOne({ _id: msg.from }).select("username").exec();
        return {
          ...(msg.toObject ? msg.toObject() : msg),
          senderUsername: senderUser ? senderUser.username : "Unknown",
        };
      })
    );

    // Get user's conversation metadata
    const userConvMetadata = (user.conversations || []).find((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
    const lastMessageInfo = getLastMessageInfo(conversation);
    
    // Generate default name if no name is set
    const conversationName = conversation.name || generateDefaultConversationName(participantInfo);

    return res.json({
      status: true,
      message: "",
      data: {
        conversation: {
          _id: conversation._id.toString(),
          participants: conversation.participants,
          participantInfo: participantInfo,
          name: conversationName,
          createdBy: conversation.createdBy,
          lastMessage: lastMessageInfo.lastMessage,
          lastMessageTime: lastMessageInfo.lastMessageTime,
          unread: userConvMetadata?.unread || false,
          updatedAt: conversation.updatedAt,
          messages: messagesWithUsernames,
        },
      },
    });
  });

  // Create a new conversation/group and send initial message
  app.post("/api/user/messages", authenticateToken, validate(createConversationSchema), async function (req: express.Request, res: express.Response) {
    const { participants, message } = req.body;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Participants array is required",
      });
    }

    // Ensure current user is included in participants
    const allParticipants = [...new Set([user._id.toString(), ...participants])];

    // Fetch usernames for participants to generate default name
    const participantInfoForName = await Promise.all(
      allParticipants.map(async (p: string) => {
        if (p === user._id.toString()) {
          return { _id: user._id.toString(), username: user.username };
        }
        const participantUser = await User.findOne({ _id: p }).select("username _id").exec();
        return participantUser ? { _id: participantUser._id.toString(), username: participantUser.username } : { _id: p, username: "Unknown" };
      })
    );
    
    // Generate default name from participant usernames
    const defaultName = generateDefaultConversationName(participantInfoForName);

    // Create new conversation in separate collection
    const newConversation = new Conversation({
      participants: allParticipants,
      name: defaultName, // Set default name from usernames
      createdBy: user._id.toString(), // Store creator ID
      updatedAt: new Date().toISOString(),
      messages: message ? [{
        from: user._id.toString(),
        message: message,
        time: new Date().toISOString(),
      }] : [],
    });
    await newConversation.save();

    // Add conversation metadata to all participants
    for (const participantId of allParticipants) {
      const participantUser = await User.findOne({ _id: participantId }).exec();
      if (participantUser) {
        if (!participantUser.conversations) {
          participantUser.conversations = [];
        }
        // Add conversation reference with user-specific metadata
        participantUser.conversations.push({
          conversationId: newConversation._id,
          unread: participantId !== user._id.toString(), // Mark as unread for others
          lastReadAt: participantId === user._id.toString() ? new Date().toISOString() : undefined,
        });
        await participantUser.save();
      }
    }

    const savedConversation = newConversation;

    // Notify all participants about new conversation via socket
    const socketManager = SocketManager.getInstance();
    const lastMessageInfo = getLastMessageInfo(savedConversation);
    for (const participantId of allParticipants) {
      if (participantId === user._id.toString()) continue;
      socketManager.notifyNewConversation(participantId, {
        _id: savedConversation._id.toString(),
        participants: savedConversation.participants,
        name: defaultName,
        lastMessage: lastMessageInfo.lastMessage,
        lastMessageTime: lastMessageInfo.lastMessageTime,
        unread: true,
        updatedAt: savedConversation.updatedAt,
      });
    }

    return res.json({
      status: true,
      message: "Conversation created successfully",
      data: {
        conversation: {
          _id: savedConversation._id.toString(),
          participants: savedConversation.participants,
          name: defaultName,
          lastMessage: lastMessageInfo.lastMessage,
          lastMessageTime: lastMessageInfo.lastMessageTime,
          updatedAt: savedConversation.updatedAt,
          messages: savedConversation.messages,
        },
      },
    });
  });

  // Send a message to a conversation
  app.post("/api/user/messages/:conversationId", authenticateToken, validateParams(conversationIdParamSchema), validate(sendMessageSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId } = req.params;
    const { message, parentMessageId } = req.body;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    if (!message) {
      return res.status(400).json({
        status: false,
        message: "Message content is required",
      });
    }

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to send messages to this conversation",
      });
    }

    // Create new message
    const newMessage = {
      from: user._id.toString(),
      message: message,
      time: new Date().toISOString(),
      parentMessageId: parentMessageId || undefined,
    };

    // Add message to conversation
    if (!conversation.messages) {
      conversation.messages = [];
    }
    conversation.messages.push(newMessage);
    conversation.updatedAt = new Date().toISOString();
    conversation.markModified('messages');
    await conversation.save();

    // Get the saved message with _id from the array (Mongoose adds _id after save)
    const savedMessage = conversation.messages[conversation.messages.length - 1];

    // Get sender username for socket notification
    const senderUsername = user.username;

    // Update unread status for all other participants
    for (const participantId of conversation.participants) {
      if (participantId === user._id.toString()) continue;
      
      const participantUser = await User.findOne({ _id: participantId }).exec();
      if (participantUser && participantUser.conversations) {
        const participantConvMetadata = participantUser.conversations.find((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
        if (participantConvMetadata) {
          participantConvMetadata.unread = true;
          participantUser.markModified('conversations');
          await participantUser.save();
        }
      }
    }

    // Send socket notification to all participants
    const socketManager = SocketManager.getInstance();
    const messageWithUsername = {
      ...savedMessage,
      senderUsername: senderUsername,
    };
    socketManager.sendNewMessage(conversationId, messageWithUsername, conversation.participants);

    return res.json({
      status: true,
      message: "Message sent successfully",
      data: {
        message: newMessage,
      },
    });
  });

  // Reply to a specific message in a conversation (threaded)
  app.post("/api/user/messages/:conversationId/reply/:messageId", authenticateToken, validateParams(messageIdParamSchema), validate(sendMessageSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId, messageId } = req.params;
    const { message } = req.body;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    if (!message) {
      return res.status(400).json({
        status: false,
        message: "Message content is required",
      });
    }

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to reply to messages in this conversation",
      });
    }

    // Verify parent message exists
    const parentMessage = conversation.messages?.find((msg: Message) => msg._id.toString() === messageId);
    if (!parentMessage) {
      return res.status(404).json({
        status: false,
        message: "Parent message not found",
      });
    }

    // Create reply message
    const replyMessage = {
      from: user._id.toString(),
      message: message,
      time: new Date().toISOString(),
      parentMessageId: messageId,
    };

    // Add reply to conversation
    if (!conversation.messages) {
      conversation.messages = [];
    }
    conversation.messages.push(replyMessage);
    conversation.updatedAt = new Date().toISOString();
    conversation.markModified('messages');
    await conversation.save();

    // Get the saved reply message with _id from the array (Mongoose adds _id after save)
    const savedReplyMessage = conversation.messages[conversation.messages.length - 1];

    // Get sender username for socket notification
    const senderUsername = user.username;

    // Update unread status for all other participants
    for (const participantId of conversation.participants) {
      if (participantId === user._id.toString()) continue;
      
      const participantUser = await User.findOne({ _id: participantId }).exec();
      if (participantUser && participantUser.conversations) {
        const participantConvMetadata = participantUser.conversations.find((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
        if (participantConvMetadata) {
          participantConvMetadata.unread = true;
          participantUser.markModified('conversations');
          await participantUser.save();
        }
      }
    }

    // Send socket notification
    const socketManager = SocketManager.getInstance();
    const replyWithUsername = {
      ...savedReplyMessage,
      senderUsername: senderUsername,
    };
    socketManager.sendNewMessage(conversationId, replyWithUsername, conversation.participants);

    return res.json({
      status: true,
      message: "Reply sent successfully",
      data: {
        message: replyMessage,
      },
    });
  });

  // Mark conversation as read
  app.put("/api/user/messages/:conversationId/mark-read", authenticateToken, validateParams(conversationIdParamSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId } = req.params;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to mark this conversation as read",
      });
    }

    // Update user's conversation metadata
    const userConvMetadata = (user.conversations || []).find((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
    if (userConvMetadata) {
      userConvMetadata.unread = false;
      userConvMetadata.lastReadAt = new Date().toISOString();
      user.markModified('conversations');
      await user.save();
    } else {
      // Add conversation metadata if it doesn't exist
      if (!user.conversations) {
        user.conversations = [];
      }
      user.conversations.push({
        conversationId: conversation._id,
        unread: false,
        lastReadAt: new Date().toISOString(),
      });
      user.markModified('conversations');
      await user.save();
    }

    return res.json({
      status: true,
      message: "Conversation marked as read",
      data: {
        conversation: {
          _id: conversation._id.toString(),
          unread: false,
        },
      },
    });
  });

  // Delete a message from a conversation
  app.delete("/api/user/messages/:conversationId/messages/:messageId", authenticateToken, validateParams(messageIdParamSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId, messageId } = req.params;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete messages from this conversation",
      });
    }

    const messageIndex = conversation.messages?.findIndex((msg: Message) => msg._id.toString() === messageId);
    
    if (messageIndex === undefined || messageIndex === -1) {
      return res.status(404).json({
        status: false,
        message: "Message not found",
      });
    }

    const message = conversation.messages[messageIndex];

    // Verify user is the sender (can only delete own messages)
    if (message.from !== user._id.toString()) {
      return res.status(403).json({
        status: false,
        message: "You can only delete your own messages",
      });
    }

    // Remove message from conversation
    conversation.messages.splice(messageIndex, 1);
    conversation.updatedAt = new Date().toISOString();
    conversation.markModified('messages');
    await conversation.save();

    // Send socket notification about deleted message
    const socketManager = SocketManager.getInstance();
    socketManager.notifyMessageDeleted(conversationId, messageId);

    return res.json({
      status: true,
      message: "Message deleted successfully",
    });
  });

  // Add participants to a conversation/group
  app.post("/api/user/messages/:conversationId/participants", authenticateToken, validateParams(conversationIdParamSchema), validate(addParticipantsSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId } = req.params;
    const { participantIds } = req.body;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "participantIds array is required",
      });
    }

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant (can add others)
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to add participants to this conversation",
      });
    }

    // Add new participants (avoid duplicates)
    const newParticipants: string[] = [];
    for (const participantId of participantIds) {
      if (!conversation.participants.includes(participantId)) {
        conversation.participants.push(participantId);
        newParticipants.push(participantId);
      }
    }

    if (newParticipants.length === 0) {
      return res.json({
        status: true,
        message: "All users are already participants",
        data: {
          conversation: {
            _id: conversation._id.toString(),
            participants: conversation.participants,
          },
        },
      });
    }

    conversation.updatedAt = new Date().toISOString();
    await conversation.save();

    // Add conversation metadata to new participants
    for (const participantId of newParticipants) {
      const participantUser = await User.findOne({ _id: participantId }).exec();
      if (participantUser) {
        if (!participantUser.conversations) {
          participantUser.conversations = [];
        }
        
        // Check if conversation metadata already exists for this participant
        const existingConvMetadata = participantUser.conversations.find((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
        if (!existingConvMetadata) {
          // Add conversation metadata for new participant
          participantUser.conversations.push({
            conversationId: conversation._id,
            unread: true, // Mark as unread for new participant
            lastReadAt: undefined,
          });
          participantUser.markModified('conversations');
          await participantUser.save();
        }
      }
    }

    // Send socket notification about conversation update
    const socketManager = SocketManager.getInstance();
    socketManager.notifyConversationUpdate(conversationId, { participants: conversation.participants });

    return res.json({
      status: true,
      message: "Participants added successfully",
      data: {
        conversation: {
          _id: conversation._id.toString(),
          participants: conversation.participants,
        },
      },
    });
  });

  // Remove participants from a conversation/group
  app.delete("/api/user/messages/:conversationId/participants/:participantId", authenticateToken, validateParams(participantIdParamSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId, participantId } = req.params;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant (can remove others, or remove themselves)
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to remove participants from this conversation",
      });
    }

    // Check if participant exists in conversation
    const participantIndex = conversation.participants.indexOf(participantId);
    if (participantIndex === -1) {
      return res.status(404).json({
        status: false,
        message: "Participant not found in conversation",
      });
    }

    // Remove participant
    conversation.participants.splice(participantIndex, 1);
    conversation.updatedAt = new Date().toISOString();
    await conversation.save();

    // Remove conversation metadata from removed participant
    const removedUser = await User.findOne({ _id: participantId }).exec();
    if (removedUser && removedUser.conversations) {
      const removedConvIndex = removedUser.conversations.findIndex((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
      if (removedConvIndex !== -1) {
        removedUser.conversations.splice(removedConvIndex, 1);
        removedUser.markModified('conversations');
        await removedUser.save();
      }
    }

    // Send socket notification about conversation update
    const socketManager = SocketManager.getInstance();
    socketManager.notifyConversationUpdate(conversationId, { participants: conversation.participants });

    return res.json({
      status: true,
      message: "Participant removed successfully",
      data: {
        conversation: {
          _id: conversation._id.toString(),
          participants: conversation.participants,
        },
      },
    });
  });

  // Update conversation name
  app.put("/api/user/messages/:conversationId/name", authenticateToken, validateParams(conversationIdParamSchema), validate(updateConversationNameSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId } = req.params;
    const { name } = req.body;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to update this conversation",
      });
    }

    // Update name
    conversation.name = name || undefined;
    conversation.updatedAt = new Date().toISOString();
    await conversation.save();

    // Send socket notification about conversation update
    const socketManager = SocketManager.getInstance();
    socketManager.notifyConversationUpdate(conversationId, { name: conversation.name });

    return res.json({
      status: true,
      message: "Conversation name updated successfully",
      data: {
        conversation: {
          _id: conversation._id.toString(),
          name: conversation.name,
        },
      },
    });
  });

  // Leave conversation (delete if last user)
  app.post("/api/user/messages/:conversationId/leave", authenticateToken, validateParams(conversationIdParamSchema), async function (req: express.Request, res: express.Response) {
    const { conversationId } = req.params;
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

    // Find conversation in separate collection
    const conversation = await Conversation.findOne({ _id: conversationId }).exec();

    if (!conversation) {
      return res.status(404).json({
        status: false,
        message: "Conversation not found",
      });
    }

    // Verify user is a participant
    if (!conversation.participants || !conversation.participants.includes(user._id.toString())) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to leave this conversation",
      });
    }

    // Get real participants
    const realParticipants = conversation.participants;

    // If user is the last real participant, delete the conversation
    if (realParticipants.length === 1 && realParticipants[0] === user._id.toString()) {
      // Remove conversation metadata from all participants
      for (const participantId of conversation.participants) {
        const participantUser = await User.findOne({ _id: participantId }).exec();
        if (participantUser && participantUser.conversations) {
          const participantConvIndex = participantUser.conversations.findIndex((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
          if (participantConvIndex !== -1) {
            participantUser.conversations.splice(participantConvIndex, 1);
            participantUser.markModified('conversations');
            await participantUser.save();
          }
        }
      }

      // Delete the conversation document
      await Conversation.deleteOne({ _id: conversationId }).exec();

      // Send socket notification about conversation deletion
      const socketManager = SocketManager.getInstance();
      socketManager.notifyConversationUpdate(conversationId, { deleted: true });

      return res.json({
        status: true,
        message: "Conversation deleted (you were the last participant)",
        data: {
          deleted: true,
        },
      });
    } else {
      // Remove user from conversation
      const userIndex = conversation.participants.indexOf(user._id.toString());
      if (userIndex !== -1) {
        conversation.participants.splice(userIndex, 1);
        conversation.updatedAt = new Date().toISOString();
        await conversation.save();
      }

      // Remove conversation metadata from user
      const convIndex = user.conversations.findIndex((uc: UserConversationMetadata) => uc.conversationId.toString() === conversationId);
      if (convIndex !== -1) {
        user.conversations.splice(convIndex, 1);
        user.markModified('conversations');
        await user.save();
      }

      // Send socket notification about conversation update
      const socketManager = SocketManager.getInstance();
      socketManager.notifyConversationUpdate(conversationId, { participants: conversation.participants });

      return res.json({
        status: true,
        message: "Left conversation successfully",
        data: {
          conversation: {
            _id: conversation._id.toString(),
            participants: conversation.participants,
          },
        },
      });
    }
  });

};

