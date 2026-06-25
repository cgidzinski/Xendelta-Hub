const { User } = require("../models/user");
const Conversation = require("../models/conversation");

const WELCOME_MESSAGE =
  "Welcome to Xendelta Hub! You have been gifted 1000 points to get started. " +
  "Visit the Shop to use your points — you can purchase XenBox storage (1GB = 1000 points) and other perks.";

export async function sendWelcomeMessage(newUserId: string): Promise<void> {
  try {
    const defaultUser = await User.findOne({ username: "Default" }).exec();
    if (!defaultUser) {
      console.warn("Default user not found, skipping welcome message");
      return;
    }

    const newConversation = new Conversation({
      participants: [defaultUser._id.toString(), newUserId],
      name: "Welcome",
      createdBy: defaultUser._id.toString(),
      updatedAt: new Date(),
      messages: [
        {
          from: defaultUser._id.toString(),
          message: WELCOME_MESSAGE,
          time: new Date(),
        },
      ],
    });
    await newConversation.save();

    defaultUser.conversations = defaultUser.conversations || [];
    defaultUser.conversations.push({
      conversationId: newConversation._id,
      unread: false,
      lastReadAt: new Date(),
    });
    defaultUser.markModified("conversations");
    await defaultUser.save();

    const newUser = await User.findById(newUserId).exec();
    if (newUser) {
      newUser.conversations = newUser.conversations || [];
      newUser.conversations.push({
        conversationId: newConversation._id,
        unread: true,
      });
      newUser.markModified("conversations");
      await newUser.save();
    }
  } catch (error) {
    console.error("Failed to send welcome message:", error);
  }
}
