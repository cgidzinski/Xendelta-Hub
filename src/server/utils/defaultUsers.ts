const { User } = require("../models/user");

/**
 * Initialize default users after MongoDB connection
 * Creates default users if they don't exist, or ensures they have the correct roles
 */
export async function initializeDefaultUsers(): Promise<void> {
  // Initialize System bot user
  const systemBot = await User.findOne({ username: "System" }).exec();
  if (!systemBot) {
    const newSystemBot = new User({
      username: "System",
      email: "system@xendelta.com",
      roles: ["bot"],
      avatar: "/avatars/default-avatar.png",
      notifications: [],
      conversations: [],
      canRespond: false, // System bot cannot be selected for conversations
    });
    await newSystemBot.save();
    console.log(">>> System bot user created");
  } else {
    // Ensure System bot has Bot role and canRespond is false
    let needsUpdate = false;
    if (!systemBot.roles || !systemBot.roles.includes("bot")) {
      if (!systemBot.roles) systemBot.roles = [];
      systemBot.roles.push("bot");
      needsUpdate = true;
    }
    if (systemBot.canRespond !== false) {
      systemBot.canRespond = false;
      needsUpdate = true;
    }
    if (needsUpdate) {
      await systemBot.save();
      console.log(">>> System bot updated");
    }
  }
  
  // Add other default users here in the future
}

