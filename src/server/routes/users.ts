import express = require("express");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
import { Resend } from "resend";

module.exports = function (app: express.Application) {
  app.get("/api/users", async function (req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = await User.findOne({}).exec();
    return res.json({
      status: true,
      message: "",
      data: {
        user: user,
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

  app.post("/api/auth/reset-password", async function (req: express.Request, res: express.Response) {
    const email = req.body.email;
    const user = await User.findOne({ email: email }).exec();
    if (user) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const new_password = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const msg = {
        to: user.email,
        from: "no-reply@xendelta.com",
        subject: "Xendelta Hub - Password Reset",
        text: `Your reset password is ${new_password}`,
        html: `Your reset password is <br/><strong>${new_password}</strong><br/>`,
      };

      const { data, error } = await resend.emails.send(msg);
      console.log(data, error);
      if (error) {
        return res.json({
          status: false,
          message: "Failed to send reset password email.",
        });
      }

      user.password = user.generateHash(new_password);
      // await user.save();
      return res.json({
        status: true,
      });
    } else {
      return res.json({
        status: false,
        message: "User Not Found.",
      });
    }
  });

  app.post("/api/change-password", function (req: express.Request, res: express.Response) {
    return res.json({
      status: true,
    });
  });
};
