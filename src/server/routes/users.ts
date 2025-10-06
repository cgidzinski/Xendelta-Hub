import express = require("express");
const { User } = require("../models/user");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
import { Resend } from "resend";
import { authenticateToken } from "../middleware/auth";

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
    const decoded = await jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded._id }).exec();
    if (user) {
      return res.json({
        status: true,
        message: "",
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
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
      var tokenData = {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      };
      var token = jwt.sign(tokenData, process.env.JWT_SECRET, { expiresIn: "24hr" });
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
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = resetTokenExpiry;
      await user.save();

      const resend = new Resend(process.env.RESEND_API_KEY);
      const resetUrl = `${
        process.env.CLIENT_URL || "http://localhost:3000"
      }/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

      const msg = {
        to: user.email,
        from: "no-reply@xendelta.com",
        subject: "Xendelta Hub - Password Reset",
        text: `Click the link below to reset your password. This link will expire in 1 hour.\n\n${resetUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>Hello ${user.username},</p>
            <p>You requested a password reset for your Xendelta Hub account. Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: linear-gradient(45deg, #667eea 30%, #764ba2 90%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">This is an automated message from Xendelta Hub.</p>
          </div>
        `,
      };

      const { data, error } = await resend.emails.send(msg);
      if (error) {
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
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
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
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
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
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

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
