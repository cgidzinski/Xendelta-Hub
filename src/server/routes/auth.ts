import express = require("express");
const { User } = require("../models/user");
const crypto = require("crypto");
import { authenticateToken } from "../middleware/auth";
import { generateToken } from "../utils/tokenUtils";
import { sendPasswordResetEmail } from "../utils/emailUtils";
import passport from "../config/passport";
import { SocketManager } from "../infrastructure/SocketManager";
import { validate, signupSchema, loginSchema } from "../utils/validation";
import { AuthenticatedRequest } from "../types";

module.exports = function (app: express.Application) {
  // Role verification endpoint - returns user's roles from database
  app.get("/api/auth/roles/verify", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();
    
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
        roles: (user.roles || []).map((role: string) => role.toLowerCase()),
      },
    });
  });

  app.post("/api/auth/verify", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();
    
    if (user) {
      // Generate new token for automatic refresh
      const newToken = generateToken({
        _id: user._id,
        username: user.username,
        email: user.email,
      });
      
      return res.json({
        status: true,
        message: "",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar || "/avatars/default-avatar.png",
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
    const username = req.body.username;
    const password = req.body.password;
    const user = await User.findOne({ username: username }).exec();

    if (user && user.validPassword(password)) {
      const token = generateToken({
        _id: user._id,
        username: user.username,
        email: user.email,
      });
      return res.json({
        success: true,
        token: token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar || "/avatars/default-avatar.png",
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
    const email = req.body.email.toLowerCase();
    const username = req.body.username;
    const password = req.body.password;

    const user = await User.findOne({ email: email }).exec();

    if (!user) {
      const newUser = new User();
      newUser.password = newUser.generateHash(password);
      newUser.email = email;
      newUser.username = username;
      newUser.roles = [];
      await newUser.save();
      
      // Add local authentication provider
      await newUser.addAuthProvider('local', null, email);
      
      // Generate token for new user
      const token = generateToken({
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
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

  // Helper function for OAuth callbacks
  const handleOAuthCallback = async (
    req: express.Request,
    res: express.Response,
    provider: 'google' | 'github'
  ) => {
    const user = req.user as any; // Passport sets full User document, not AuthenticatedRequest structure
    const state = req.query.state;
    const userId = req.query.userId;
    
    // Check if this is an account linking request
    if (state === 'link' && userId) {
      // Link OAuth account to existing local account
      const existingUser = await User.findById(userId).exec();
      if (existingUser) {
        const providerId = provider === 'google' 
          ? user.googleId 
          : user.authProviders.find((p: any) => p.provider === 'github')?.providerId;
        
        await existingUser.addAuthProvider(provider, providerId, user.email);
        
        // Generate token for the linked account
        const token = generateToken({
          _id: existingUser._id,
          username: existingUser.username,
          email: existingUser.email,
        });
        
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}&linked=true`);
        return;
      }
    }
    
    // Regular OAuth flow
    const token = generateToken({
      _id: user._id,
      username: user.username,
      email: user.email,
    });

    // Redirect to frontend with token
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
  };

  // Google OAuth Routes
  app.get("/api/auth/google", 
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
  );

  app.get("/api/auth/google/callback", 
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    async function (req: express.Request, res: express.Response) {
      try {
        await handleOAuthCallback(req, res, 'google');
      } catch (error) {
        console.error("Google OAuth callback error:", error);
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
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
        await handleOAuthCallback(req, res, 'github');
      } catch (error) {
        console.error("GitHub OAuth callback error:", error);
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
      }
    }
  );
};