import express = require("express");
import { AppError, loadCaller } from "../utils/http";
import { User } from "../models/user";
import { Notification } from "../models/notification";
import { authenticateToken } from "../middleware/auth";
import { generateToken } from "../utils/tokenUtils";
import { sendPasswordResetEmail } from "../utils/emailUtils";
import passport from "../config/passport";
import { SocketManager } from "../infrastructure/SocketManager";
import {
  validate,
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyResetTokenSchema,
  resetPasswordSchema,
} from "../utils/validation";
import { randomToken, hashToken } from "../utils/tokens";

// A recovery link is good for one hour. Keep in step with the wording in utils/emailUtils.ts.
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

module.exports = function (app: express.Application) {
  // Role verification endpoint - returns user's roles from database
  app.get("/api/auth/roles/verify", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await loadCaller(req);

    if (!user) {
      throw new AppError(404, "User not found");
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
    const user = await loadCaller(req);

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
      throw new AppError(401, "User Not Found.");
    }
  });

  app.post("/api/auth/login", validate(loginSchema), async function (req: express.Request, res: express.Response) {
    const email = req.body.email.toLowerCase();
    const password = req.body.password;
    const user = await User.findOne({ email: email.toLowerCase() }).exec();

    if (user && user.validPassword(password)) {
      const token = generateToken({
        _id: user._id,
        username: user.username,
        email: user.email,
      });
      return res.json({
        success: true,
        status: true,
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
        status: false,
        message: "User Not Found.",
      });
    }
  });

  app.post("/api/auth/signup", validate(signupSchema), async function (req: express.Request, res: express.Response) {
    const email = req.body.email.toLowerCase();
    const username = req.body.username;
    const password = req.body.password;

    const user = await User.findOne({ email: email.toLowerCase() }).exec();

    if (!user) {
      const newUser = new User();
      newUser.password = newUser.generateHash(password);
      newUser.email = email;
      newUser.username = username;
      newUser.roles = [];
      await newUser.save();

      // Add local authentication provider
      await newUser.addAuthProvider("local", null, email);

      // Generate token for new user
      const token = generateToken({
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
      });

      return res.json({
        success: true,
        status: true,
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
      const hasGoogle = user.hasAuthProvider("google");
      const hasLocal = user.hasAuthProvider("local");

      if (hasGoogle && !hasLocal) {
        return res.json({
          success: false,
          status: false,
          message:
            "An account with this email already exists through Google. Please sign in with Google or use a different email.",
          existingProvider: "google",
        });
      } else if (hasLocal) {
        return res.json({
          success: false,
          status: false,
          message: "An account with this email already exists. Please sign in or use a different email.",
          existingProvider: "local",
        });
      } else {
        return res.json({
          success: false,
          status: false,
          message: "An account with this email already exists. Please sign in or use a different email.",
          existingProvider: "unknown",
        });
      }
    }
  });

  app.post(
    "/api/auth/forgot-password",
    validate(forgotPasswordSchema),
    async function (req: express.Request, res: express.Response) {
      const email = req.body.email;
      const user = await User.findOne({ email: email.toLowerCase() }).exec();

      if (user) {
        // Generate a secure random token
        const resetToken = randomToken(32);
        const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        // Save the token and expiry to the user
        // Only the hash is stored; the raw token exists only in the emailed link.
        user.set("resetPassword.token", hashToken(resetToken));
        user.set("resetPassword.expires", resetTokenExpiry);
        await user.save();

        const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || "3000"}`;
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email.toLowerCase())}`;

        const emailResult = await sendPasswordResetEmail({
          username: user.username ?? "",
          email: email.toLowerCase(),
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
    },
  );

  app.post(
    "/api/auth/verify-reset-token",
    validate(verifyResetTokenSchema),
    async function (req: express.Request, res: express.Response) {
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
        "resetPassword.token": hashToken(token),
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
    },
  );

  app.post(
    "/api/auth/reset-password",
    validate(resetPasswordSchema),
    async function (req: express.Request, res: express.Response) {
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
        "resetPassword.token": hashToken(token),
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
      user.set("resetPassword.token", undefined);
      user.set("resetPassword.expires", undefined);
      // Without this the new password and the cleared token were only ever set in memory.
      await user.save();

      // Add notification to separate collection
      const newNotification = new Notification({
        userId: user._id,
        title: "Password Reset",
        message: "Your password has been successfully reset",
        time: new Date().toISOString(),
        icon: "lock",
        unread: true,
      });

      await newNotification.save();

      // Send socket notification
      const socketManager = SocketManager.getInstance();
      socketManager.sendNotification(user._id.toString(), newNotification);

      return res.json({
        status: true,
        message: "Password has been reset successfully.",
      });
    },
  );

  // Helper function for OAuth callbacks
  const handleOAuthCallback = async (req: express.Request, res: express.Response) => {
    const user = req.user as any; // Passport sets full User document, not AuthenticatedRequest structure
    // Regular OAuth flow
    const token = generateToken({
      _id: user._id,
      username: user.username,
      email: user.email,
    });

    // Redirect to frontend with token
    res.redirect(`/auth/callback?token=${token}`);
  };

  // Google OAuth Routes
  app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));

  app.get(
    "/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login", session: false }),
    async function (req: express.Request, res: express.Response) {
      try {
        await handleOAuthCallback(req, res);
      } catch (error) {
        console.error("Google OAuth callback error:", error);
        res.redirect(`/login?error=oauth_failed`);
      }
    },
  );

  // GitHub OAuth Routes
  app.get("/api/auth/github", passport.authenticate("github", { scope: ["user:email"], session: false }));

  app.get(
    "/api/auth/github/callback",
    passport.authenticate("github", { failureRedirect: "/login", session: false }),
    async function (req: express.Request, res: express.Response) {
      try {
        await handleOAuthCallback(req, res);
      } catch (error) {
        console.error("GitHub OAuth callback error:", error);
        res.redirect(`/login?error=oauth_failed`);
      }
    },
  );

  // Discord OAuth Routes
  app.get("/api/auth/discord", passport.authenticate("discord", { session: false }));

  app.get(
    "/api/auth/discord/callback",
    passport.authenticate("discord", { failureRedirect: "/login", session: false }),
    async function (req: express.Request, res: express.Response) {
      try {
        await handleOAuthCallback(req, res);
      } catch (error) {
        console.error("Discord OAuth callback error:", error);
        res.redirect(`/login?error=oauth_failed`);
      }
    },
  );
};
