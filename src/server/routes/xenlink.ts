import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
const { User } = require("../models/user");
const { XenLink } = require("../models/xenlink");
module.exports = function (app: express.Application) {
  app.get("/api/xenlink/list", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id.toString();
    const user = await User.findById(userId).populate("xenlink").exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }
    const links = user.xenlink;
    return res.json({
      status: true,
      data: { links },
    });
  });

  app.post("/api/xenlink", authenticateToken, async function (req: express.Request, res: express.Response) {
    const link = req.body;
    const userId = (req as AuthenticatedRequest).user!._id.toString();
    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }
    const xenlink = new XenLink({
      name: link.name,
      url: link.url,
    });
    await xenlink.save();
    user.xenlink.push(xenlink._id);
    await user.save();
    return res.json({
      status: true,
      message: "Link created successfully",
    });
  });

  app.put("/api/xenlink", authenticateToken, async function (req: express.Request, res: express.Response) {
    const link = req.body;
    const userId = (req as AuthenticatedRequest).user!._id.toString();
    const user = await User.findById(userId).populate("xenlink").exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }
    const xenlink = user.xenlink.find((l: any) => l._id.toString() === link._id);
    if (!xenlink) {
      return res.status(404).json({
        status: false,
        message: "Link not found",
      });
    }
    xenlink.name = link.name;
    xenlink.url = link.url;
    xenlink.updatedAt = new Date();
    await user.save();
    return res.json({
      status: true,
      message: "Link updated successfully",
    });
  });

  app.delete("/api/xenlink/:linkId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const linkId = req.params.linkId;
    const userId = (req as AuthenticatedRequest).user!._id.toString();
    const user = await User.findById(userId).populate("xenlink").exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }
    const xenlink = user.xenlink.find((l: any) => l._id.toString() === linkId);
    if (!xenlink) {
      return res.status(404).json({
        status: false,
        message: "Link not found",
      });
    }
    await XenLink.findByIdAndDelete(linkId);
    user.xenlink.pull(linkId);
    await user.save();
    return res.json({
      status: true,
      message: "Link deleted successfully",
    });
  });

  app.get("/api/xenlink/redirect/:slug", async function (req: express.Request, res: express.Response) {
    const slug = req.params.slug;
    console.log(slug);
    const link = await XenLink.findOne({ slug }).exec();
    console.log(link);
    if (!link) {
      return res.status(404).json({
        status: false,
        message: "Link not found",
      });
    }
    return res.json({
      status: true,
      data: { link },
    });
  });
};
