import express = require("express");
const { User } = require("../models/user");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
import path from "path";
import { authenticateToken } from "../middleware/auth";
import { generateToken } from "../utils/tokenUtils";
import { sendPasswordResetEmail } from "../utils/emailUtils";
import passport from "../config/passport";
import { SocketManager } from "../infrastructure/SocketManager";
import fsPromises from "fs/promises";
import { saveAvatarFile, getLocalAvatarPath, getAvatarMimeType, getAvatarExtension, isLocalAvatar, AVATARS_DIR } from "../utils/avatarUtils";
import { validate, signupSchema, loginSchema, updateProfileSchema } from "../utils/validation";
import { AuthenticatedRequest } from "../types";
import { upload } from "../config/multer";

module.exports = function (app: express.Application) {
  // Role verification endpoint - returns user's roles from database
  app.get("/api/user/roles/verify", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as any).user._id }).exec();
    
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }
    
    return res.json({
      status: true,
      message: "",
      data: {
        roles: user.roles || [],
      },
    });
  });

  app.get("/api/user/profile", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as any).user._id }).exec();
    
    // Check if user has any unread messages in any conversation
    // user.conversations now contains metadata with unread flag
    const hasUnreadMessages = (user.conversations || []).some((convMetadata: any) => {
      return convMetadata.unread === true;
    });
    
    return res.json({
      status: true,
      message: "",
      data: {
        user: {
          _id: user._id.toString(),
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          roles: user.roles || [],
          unread_messages: hasUnreadMessages,
          unread_notifications: user.notifications.some((notification: any) => notification.unread),
        },
      },
    });
  });

  app.put("/api/user/profile", authenticateToken, validate(updateProfileSchema), async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as any).user._id }).exec();
    const { avatar } = req.body;

    if (avatar !== undefined) user.avatar = avatar;

    const newNotification = {
      title: "Profile updated",
      message: "Your profile has been successfully updated",
      time: new Date().toISOString(),
      icon: "person",
      unread: true,
    };

    user.notifications.unshift(newNotification);
    await user.save();

    // Get the saved notification with _id
    const savedNotification = user.notifications[0];

    // Send socket notification
    const socketManager = SocketManager.getInstance();
    socketManager.sendNotification(user._id.toString(), savedNotification);
    return res.json({
      status: true,
      message: "",
      data: {
        user: {
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          unread_messages: false,
          unread_notifications: true,
        },
      },
    });
  });

  // Avatar upload endpoint
  app.post("/api/user/avatar", authenticateToken, upload.single("avatar"), async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as any).user._id }).exec();
    
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded",
      });
    }

    const avatarPath = await saveAvatarFile(req.file, user._id.toString());
    user.avatar = avatarPath;
    await user.save();

    const newNotification = {
      title: "Avatar updated",
      message: "Your avatar has been successfully updated",
      time: new Date().toISOString(),
      icon: "person",
      unread: true,
    };

    user.notifications.unshift(newNotification);
    await user.save();

    // Get the saved notification with _id
    const savedNotification = user.notifications[0];

    // Send socket notification
    const socketManager = SocketManager.getInstance();
    socketManager.sendNotification(user._id.toString(), savedNotification);

    return res.json({
      status: true,
      message: "Avatar uploaded successfully",
      data: {
        avatar: user.avatar,
      },
    });
  });

  // Serve avatar image
  app.get("/avatar/:userId", async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;
    
    // Check user record first to get the correct file extension
    const user = await User.findOne({ _id: userId }).exec();
    
    if (!user) {
      // Return default avatar if user not found
      const defaultAvatarPath = path.join(AVATARS_DIR, "default-avatar.png");
      res.setHeader("Content-Type", "image/png");
      return res.sendFile(defaultAvatarPath);
    }

    // Check if avatar is a local file
    if (isLocalAvatar(user.avatar)) {
      const localPath = await getLocalAvatarPath(user.avatar).catch(() => null);
      if (localPath) {
        const mimeType = getAvatarMimeType(localPath);
        res.setHeader("Content-Type", mimeType);
        return res.sendFile(localPath);
      }
    }

    // Try common extensions (jpg, png, gif) in order
    const extensions = ["jpg", "png", "gif"];
    for (const ext of extensions) {
      const userAvatarPath = path.join(AVATARS_DIR, `${userId}.${ext}`);
      try {
        await fsPromises.access(userAvatarPath);
        const mimeType = getAvatarMimeType(userAvatarPath);
        res.setHeader("Content-Type", mimeType);
        return res.sendFile(userAvatarPath);
      } catch {
        // Continue to next extension
      }
    }

    // If external URL (legacy), redirect to external URL
    if (user.avatar && (user.avatar.startsWith("http://") || user.avatar.startsWith("https://"))) {
      return res.redirect(user.avatar);
    }

    // Fallback to default avatar
    const defaultAvatarPath = path.join(AVATARS_DIR, "default-avatar.png");
    res.setHeader("Content-Type", "image/png");
    return res.sendFile(defaultAvatarPath);
  });

  app.post("/api/auth/verify", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as any).user._id }).exec();
    
    if (user) {
      // Generate new token for automatic refresh
      const newToken = generateToken({
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      });
      
      return res.json({
        status: true,
        message: "",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
        token: newToken,
      });
    } else {
      return res.json({
        status: false,
        message: "User Not Found.",
      });
    }
  });

  app.post("/api/auth/login", validate(loginSchema), async function (req: express.Request, res: express.Response) {
    var username = req.body.username;
    var password = req.body.password;
    const user = await User.findOne({ username: username }).exec();

    if (user && user.validPassword(password)) {
      var token = generateToken({
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      });
      return res.json({
        success: true,
        token: token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
      });
    } else {
      return res.json({
        success: false,
        message: "User Not Found.",
      });
    }
  });

  app.post("/api/auth/signup", validate(signupSchema), async function (req: express.Request, res: express.Response) {
    var email = req.body.email.toLowerCase();
    var username = req.body.username;
    var password = req.body.password;

    const user = await User.findOne({ email: email }).exec();

    if (!user) {
      var newUser = new User();
      newUser.password = newUser.generateHash(password);
      newUser.email = email;
      newUser.username = username;
      newUser.roles = [];
      await newUser.save();
      
      // Add local authentication provider
      await newUser.addAuthProvider('local', null, email);
      
      // Generate token for new user
      var token = generateToken({
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        avatar: newUser.avatar,
      });
      
      return res.json({
        success: true,
        token: token,
        user: {
          id: newUser._id,
          username: newUser.username,
          email: newUser.email,
          avatar: newUser.avatar,
        },
      });
    } else {
      // User exists - check what authentication providers they have
      const activeProviders = user.getActiveProviders();
      const hasGoogle = user.hasAuthProvider('google');
      const hasLocal = user.hasAuthProvider('local');
      
      if (hasGoogle && !hasLocal) {
        return res.json({
          success: false,
          message: "An account with this email already exists through Google. Please sign in with Google or use a different email.",
          existingProvider: 'google'
        });
      } else if (hasLocal) {
        return res.json({
          success: false,
          message: "An account with this email already exists. Please sign in or use a different email.",
          existingProvider: 'local'
        });
      } else {
        return res.json({
          success: false,
          message: "An account with this email already exists. Please sign in or use a different email.",
          existingProvider: 'unknown'
        });
      }
    }
  });

  app.post("/api/auth/forgot-password", async function (req: express.Request, res: express.Response) {
    const email = req.body.email;
    const user = await User.findOne({ email: email }).exec();

    if (user) {
      // Generate a secure random token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Save the token and expiry to the user
      user.resetPassword.token = resetToken;
      user.resetPassword.expires = resetTokenExpiry;
      await user.save();

      const resetUrl = `${
        process.env.CLIENT_URL || "http://localhost:3000"
      }/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

      const emailResult = await sendPasswordResetEmail({
        username: user.username,
        email: user.email,
        resetUrl: resetUrl,
      });

      if (!emailResult.success) {
        return res.json({
          status: false,
          message: "Failed to send reset password email.",
        });
      }

      return res.json({
        status: true,
        message: "Password reset email sent successfully.",
      });
    } else {
      // Always return success to prevent email enumeration attacks
      return res.json({
        status: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    }
  });

  app.post("/api/auth/verify-reset-token", async function (req: express.Request, res: express.Response) {
    const { token, email } = req.body;

    if (!token) {
      return res.json({
        status: false,
        message: "Reset token is required.",
      });
    }

    if (!email) {
      return res.json({
        status: false,
        message: "Email is required for token verification.",
      });
    }

    const user = await User.findOne({
      "resetPassword.token": token,
      "resetPassword.expires": { $gt: Date.now() },
      email: email.toLowerCase(),
    }).exec();

    if (!user) {
      return res.json({
        status: false,
        message: "Invalid or expired reset token, or email does not match.",
      });
    }

    return res.json({
      status: true,
      message: "Reset token is valid.",
      user: {
        email: user.email,
        username: user.username,
      },
    });
  });

  app.post("/api/auth/reset-password", async function (req: express.Request, res: express.Response) {
    const { token, newPassword, email } = req.body;

    if (!token || !newPassword) {
      return res.json({
        status: false,
        message: "Reset token and new password are required.",
      });
    }

    if (!email) {
      return res.json({
        status: false,
        message: "Email is required for password reset.",
      });
    }

    if (newPassword.length < 6) {
      return res.json({
        status: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const user = await User.findOne({
      "resetPassword.token": token,
      "resetPassword.expires": { $gt: Date.now() },
      email: email.toLowerCase(),
    }).exec();

    if (!user) {
      return res.json({
        status: false,
        message: "Invalid or expired reset token, or email does not match.",
      });
    }

    // Update password and clear reset token
    user.password = user.generateHash(newPassword);
    user.resetPassword.token = undefined;
    user.resetPassword.expires = undefined;

    // Add notification
    const newNotification = {
      title: "Password Reset",
      message: "Your password has been successfully reset",
      time: new Date().toISOString(),
      icon: "lock",
      unread: true,
    };

    user.notifications.unshift(newNotification);
    await user.save();

    // Get the saved notification with _id
    const savedNotification = user.notifications[0];

    // Send socket notification
    const socketManager = SocketManager.getInstance();
    socketManager.sendNotification(user._id.toString(), savedNotification);

    return res.json({
      status: true,
      message: "Password has been reset successfully.",
    });
  });

  // Get user's linked authentication providers
  app.get("/api/user/auth-providers", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as any).user;
      const fullUser = await User.findById(user._id).exec();
      
      if (!fullUser) {
        return res.json({
          success: false,
          message: "User not found"
        });
      }
      
      const activeProviders = fullUser.getActiveProviders();
      
      return res.json({
        success: true,
        providers: activeProviders,
        canUnlinkLocal: activeProviders.length > 1 || !fullUser.hasAuthProvider('local')
      });
    } catch (error) {
      console.error("Get auth providers error:", error);
      return res.json({
        success: false,
        message: "Failed to get authentication providers"
      });
    }
  });

  // Link Google account to existing account
  app.post("/api/user/link-google", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as any).user;
      
      // Check if Google is already linked
      const fullUser = await User.findById(user._id).exec();
      if (fullUser.hasAuthProvider('google')) {
        return res.json({
          success: false,
          message: "Google account is already linked"
        });
      }
      
      return res.json({
        success: true,
        message: "Redirect to Google OAuth for account linking",
        redirectUrl: `/api/auth/google?state=link&userId=${user._id}`
      });
    } catch (error) {
      console.error("Link Google account error:", error);
      return res.json({
        success: false,
        message: "Failed to initiate Google account linking"
      });
    }
  });

  // Link GitHub account to existing account
  app.post("/api/user/link-github", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as any).user;
      
      // Check if GitHub is already linked
      const fullUser = await User.findById(user._id).exec();
      if (fullUser.hasAuthProvider('github')) {
        return res.json({
          success: false,
          message: "GitHub account is already linked"
        });
      }
      
      return res.json({
        success: true,
        message: "Redirect to GitHub OAuth for account linking",
        redirectUrl: `/api/auth/github?state=link&userId=${user._id}`
      });
    } catch (error) {
      console.error("Link GitHub account error:", error);
      return res.json({
        success: false,
        message: "Failed to initiate GitHub account linking"
      });
    }
  });

  // Unlink authentication provider
  app.post("/api/user/unlink-provider", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as any).user;
      const { provider } = req.body;
      
      if (!provider) {
        return res.json({
          success: false,
          message: "Provider is required"
        });
      }
      
      const fullUser = await User.findById(user._id).exec();
      
      if (!fullUser.hasAuthProvider(provider)) {
        return res.json({
          success: false,
          message: `${provider} account is not linked`
        });
      }
      
      // Prevent unlinking if it's the only authentication method
      const activeProviders = fullUser.getActiveProviders();
      if (activeProviders.length <= 1) {
        return res.json({
          success: false,
          message: "Cannot unlink the only authentication method. Please add another method first."
        });
      }
      
      await fullUser.removeAuthProvider(provider);
      
      return res.json({
        success: true,
        message: `${provider} account unlinked successfully`,
        providers: fullUser.getActiveProviders()
      });
    } catch (error) {
      console.error("Unlink provider error:", error);
      return res.json({
        success: false,
        message: "Failed to unlink authentication provider"
      });
    }
  });

  // Add password to Google-only account
  app.post("/api/user/add-password", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as any).user;
      const { password } = req.body;
      
      if (!password) {
        return res.json({
          success: false,
          message: "Password is required"
        });
      }
      
      const fullUser = await User.findById(user._id).exec();
      
      if (fullUser.password) {
        return res.json({
          success: false,
          message: "Account already has a password"
        });
      }
      
      fullUser.password = fullUser.generateHash(password);
      await fullUser.addAuthProvider('local', null, fullUser.email);
      
      return res.json({
        success: true,
        message: "Password added successfully. You can now sign in with email and password.",
        providers: fullUser.getActiveProviders()
      });
    } catch (error) {
      console.error("Add password error:", error);
      return res.json({
        success: false,
        message: "Failed to add password"
      });
    }
  });

  // Google OAuth Routes
  app.get("/api/auth/google", 
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
  );

  app.get("/api/auth/google/callback", 
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    async function (req: express.Request, res: express.Response) {
      try {
        const user = req.user as any;
        const state = req.query.state;
        const userId = req.query.userId;
        
        // Check if this is an account linking request
        if (state === 'link' && userId) {
          // Link Google account to existing local account
          const existingUser = await User.findById(userId).exec();
          if (existingUser) {
            await existingUser.addAuthProvider('google', user.googleId, user.email);
            
            // Generate token for the linked account
            const token = generateToken({
              _id: existingUser._id,
              username: existingUser.username,
              email: existingUser.email,
              avatar: existingUser.avatar,
            });
            
            res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${token}&linked=true`);
            return;
          }
        }
        
        // Regular Google OAuth flow
        const token = generateToken({
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        });

        // Redirect to frontend with token
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${token}`);
      } catch (error) {
        console.error("Google OAuth callback error:", error);
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_failed`);
      }
    }
  );

  // GitHub OAuth Routes
  app.get("/api/auth/github", 
    passport.authenticate('github', { scope: ['user:email'], session: false })
  );

  app.get("/api/auth/github/callback", 
    passport.authenticate('github', { failureRedirect: '/login', session: false }),
    async function (req: express.Request, res: express.Response) {
      try {
        const user = req.user as any;
        const state = req.query.state;
        const userId = req.query.userId;
        
        // Check if this is an account linking request
        if (state === 'link' && userId) {
          // Link GitHub account to existing local account
          const existingUser = await User.findById(userId).exec();
          if (existingUser) {
            await existingUser.addAuthProvider('github', user.authProviders.find((p: any) => p.provider === 'github')?.providerId, user.email);
            
            // Generate token for the linked account
            const token = generateToken({
              _id: existingUser._id,
              username: existingUser.username,
              email: existingUser.email,
              avatar: existingUser.avatar,
            });
            
            res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${token}&linked=true`);
            return;
          }
        }
        
        // Regular GitHub OAuth flow
        const token = generateToken({
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        });

        // Redirect to frontend with token
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${token}`);
      } catch (error) {
        console.error("GitHub OAuth callback error:", error);
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_failed`);
      }
    }
  );

  // Get all users (for admin and message participant selection)
  app.get("/api/users", authenticateToken, async function (req: express.Request, res: express.Response) {
    const users = await User.find({}, "username email _id roles avatar").exec();
    
    return res.json({
      status: true,
      message: "",
      data: {
        users: users.map((user: any) => ({
          _id: user._id,
          username: user.username,
          email: user.email,
          roles: user.roles || [],
          avatar: user.avatar,
        })),
      },
    });
  });

  // Add admin role to current user (for development/testing)
  app.post("/api/user/make-admin", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as any).user._id }).exec();
    
    if (!user.roles) {
      user.roles = [];
    }
    
    if (!user.roles.includes("admin")) {
      user.roles.push("admin");
      await user.save();
    }
    
    return res.json({
      status: true,
      message: "Admin role added successfully",
      data: {
        user: {
          username: user.username,
          email: user.email,
          roles: user.roles,
        },
      },
    });
  });
};
