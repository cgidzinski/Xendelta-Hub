import express = require("express");
const { User } = require("../models/user");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
import { authenticateToken } from "../middleware/auth";
import { generateToken, verifyToken } from "../utils/tokenUtils";
import { sendPasswordResetEmail } from "../utils/emailUtils";

module.exports = function (app: express.Application) {
  app.get("/api/user/profile", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: req.user!._id }).exec();
    return res.json({
      status: true,
      message: "",
      data: {
        user: {
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          unread_messages: false,
          unread_notifications: user.notifications.some((notification: any) => notification.unread),
        },
      },
    });
  });

  app.put("/api/user/profile", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: req.user!._id }).exec();
    const { avatar } = req.body;

    if (avatar !== undefined) user.avatar = avatar;

    user.notifications.unshift({
      title: "Profile updated",
      message: "Your profile has been successfully updated",
      time: new Date().toISOString(),
      icon: "person",
      unread: true,
    });

    await user.save();
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

  app.post("/api/auth/verify", async function (req: express.Request, res: express.Response) {
    const token = req.headers.authorization;
    
    if (!token) {
      return res.json({
        status: false,
        message: "Token is required.",
      });
    }
    
    const decoded = verifyToken(token);
    const user = await User.findOne({ _id: decoded._id }).exec();
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
          _id: user._id,
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

  app.post("/api/auth/login", async function (req: express.Request, res: express.Response) {
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
        user: user,
      });
    } else {
      return res.json({
        success: false,
        message: "User Not Found.",
      });
    }
  });

  app.post("/api/auth/signup", async function (req: express.Request, res: express.Response) {
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
      return res.json({
        success: true,
      });
    } else {
      return res.json({
        success: false,
        message: "Registration Failed!",
      });
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
    user.notifications.unshift({
      title: "Password Reset",
      message: "Your password has been successfully reset",
      time: new Date().toISOString(),
      icon: "lock",
      unread: true,
    });

    await user.save();

    return res.json({
      status: true,
      message: "Password has been reset successfully.",
    });
  });

  app.post("/api/change-password", function (req: express.Request, res: express.Response) {
    return res.json({
      status: true,
    });
  });
};
