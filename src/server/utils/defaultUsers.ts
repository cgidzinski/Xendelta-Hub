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
      roles: ["Bot"],
      avatar: "/avatars/default-avatar.png",
      notifications: [],
      conversations: [],
    });
    await newSystemBot.save();
    console.log(">>> System bot user created");
  } else {
    // Ensure System bot has Bot role
    if (!systemBot.roles || !systemBot.roles.includes("Bot")) {
      if (!systemBot.roles) systemBot.roles = [];
      systemBot.roles.push("Bot");
      await systemBot.save();
      console.log(">>> System bot role updated");
    }
  }
  
  // Add other default users here in the future
}

