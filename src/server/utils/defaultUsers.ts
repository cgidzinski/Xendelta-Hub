const { User } = require("../models/user");

/**
 * Initialize default users after MongoDB connection
 * Creates default users if they don't exist, or ensures they have the correct roles
 */
export async function initializeDefaultUsers(): Promise<void> {
  // Initialize System bot user
  const defaultUser = await User.findOne({ username: "Default" }).exec();
  if (!defaultUser) {
    const newDefaultUser = new User({
      username: "Default",
      email: "default@xendelta.com",
      roles: ["bot"],
      avatar: "/avatars/default-avatar.png",
      notifications: [],
      conversations: [],
    });
    await newDefaultUser.save();
    console.log(">>> Default user created");
  }
}
