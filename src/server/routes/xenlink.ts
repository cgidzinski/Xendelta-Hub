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
import { AppError, callerId } from "../utils/http";
import { XenLink } from "../models/xenlink";

// A link belongs to the person in its `owner_id`. Looking a link up by `{ _id, owner_id }` answers "not yours"
// and "doesn't exist" the same way (404), so one person can't probe another's ids.
module.exports = function (app: express.Application) {
  app.get("/api/xenlink/list", authenticateToken, async function (req: express.Request, res: express.Response) {
    const links = await XenLink.find({ owner_id: callerId(req) })
      .sort({ _id: 1 })
      .select("-owner_id")
      .exec();
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
      await new XenLink({ name: link.name, url: link.url, owner_id: callerId(req) }).save();
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
      const updated = await XenLink.updateOne(
        { _id: link._id, owner_id: callerId(req) },
        { name: link.name, url: link.url, updatedAt: new Date() },
      );
      if (updated.matchedCount === 0) throw new AppError(404, "Link not found");
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
      const deleted = await XenLink.deleteOne({ _id: req.params.linkId, owner_id: callerId(req) });
      if (deleted.deletedCount === 0) throw new AppError(404, "Link not found");
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
      // Public: don't expose who owns the link.
      const link = await XenLink.findOne({ slug }).select("-owner_id").exec();
      if (!link) throw new AppError(404, "Link not found");
      return res.json({
        status: true,
        data: { link },
      });
    },
  );
};
