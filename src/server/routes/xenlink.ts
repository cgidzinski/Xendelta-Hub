import express = require("express");
import {
  validate,
  validateParams,
  xenLinkCreateSchema,
  xenLinkIdParamSchema,
  xenLinkSlugParamSchema,
  xenLinkUpdateSchema,
} from "../utils/validation";
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import { User } from "../models/user";
import { XenLink, createXenLink } from "../models/xenlink";
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

  app.post(
    "/api/xenlink",
    authenticateToken,
    validate(xenLinkCreateSchema),
    async function (req: express.Request, res: express.Response) {
      const link = req.body;
      const userId = (req as AuthenticatedRequest).user!._id.toString();
      const user = await User.findById(userId).exec();
      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found",
        });
      }
      const xenlink = await createXenLink({ name: link.name, url: link.url });
      user.xenlink.push(xenlink._id);
      await user.save();
      return res.json({
        status: true,
        message: "Link created successfully",
      });
    },
  );

  app.put(
    "/api/xenlink",
    authenticateToken,
    validate(xenLinkUpdateSchema),
    async function (req: express.Request, res: express.Response) {
      const link = req.body;
      const userId = (req as AuthenticatedRequest).user!._id.toString();
      const user = await User.findById(userId).exec();
      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found",
        });
      }
      const owned = user.xenlink.some((id) => id.toString() === link._id);
      if (!owned) {
        return res.status(404).json({
          status: false,
          message: "Link not found",
        });
      }
      // Update the XenLink document itself: changes made to a populated copy are not written
      // back by user.save(), so editing a link through the user silently did nothing.
      await XenLink.updateOne({ _id: link._id }, { name: link.name, url: link.url, updatedAt: new Date() });
      return res.json({
        status: true,
        message: "Link updated successfully",
      });
    },
  );

  app.delete(
    "/api/xenlink/:linkId",
    authenticateToken,
    validateParams(xenLinkIdParamSchema),
    async function (req: express.Request, res: express.Response) {
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
      user.set(
        "xenlink",
        user.xenlink.filter((id) => id.toString() !== linkId),
      );
      await user.save();
      return res.json({
        status: true,
        message: "Link deleted successfully",
      });
    },
  );

  app.get(
    "/api/xenlink/redirect/:slug",
    validateParams(xenLinkSlugParamSchema),
    async function (req: express.Request, res: express.Response) {
      const slug = req.params.slug;
      const link = await XenLink.findOne({ slug }).exec();
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
    },
  );
};
