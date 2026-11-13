import express = require("express");
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
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
import { XenLink, XenLinkDay, utcDay } from "../models/xenlink";
import { STATS_DAYS, normalizeDestination } from "../../shared/xenlink";

// A link belongs to the person in its `owner_id`. Looking a link up by `{ _id, owner_id }` answers "not yours"
// and "doesn't exist" the same way (404), so one person can't probe another's ids.

const DUPLICATE_KEY = 11000;
const isDuplicate = (err: unknown) => (err as { code?: number })?.code === DUPLICATE_KEY;

// Following a link is public and writes a count, so it is limited per visitor (Cloudflare's client address, as elsewhere).
const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => ipKeyGenerator(String(req.headers["cf-connecting-ip"] || req.ip)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, message: "Too many requests. Please wait a moment and try again." },
});

const expiry = (value: string | null | undefined) => (value ? new Date(value) : undefined);

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
      const link = xenLinkCreateSchema.parse(req.body);
      try {
        await new XenLink({
          name: link.name,
          url: link.url,
          owner_id: callerId(req),
          ...(link.slug ? { slug: link.slug } : {}),
          ...(link.expiresAt ? { expires_at: expiry(link.expiresAt) } : {}),
        }).save();
      } catch (err) {
        if (isDuplicate(err)) throw new AppError(409, "That short name is already taken");
        throw err;
      }
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
      const link = xenLinkUpdateSchema.parse(req.body);
      const set: Record<string, unknown> = { name: link.name, url: link.url, updatedAt: new Date() };
      const unset: Record<string, ""> = {};
      if (link.slug) set.slug = link.slug;
      if (link.expiresAt !== undefined) {
        if (link.expiresAt) set.expires_at = expiry(link.expiresAt);
        else unset.expires_at = "";
      }
      let updated;
      try {
        updated = await XenLink.updateOne(
          { _id: link._id, owner_id: callerId(req) },
          { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        );
      } catch (err) {
        if (isDuplicate(err)) throw new AppError(409, "That short name is already taken");
        throw err;
      }
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
      const link = await XenLink.findOneAndDelete({ _id: req.params.linkId, owner_id: callerId(req) });
      if (!link) throw new AppError(404, "Link not found");
      await XenLinkDay.deleteMany({ link_id: link._id });
      return res.json({
        status: true,
        message: "Link deleted successfully",
      });
    },
  );

  // How a link is doing: its total, when it was last used, and clicks per day for the last STATS_DAYS days (oldest
  // first, days with none included as 0, so the chart needs no filling in).
  app.get(
    "/api/xenlink/:linkId/stats",
    authenticateToken,
    validateParams(xenLinkIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const link = await XenLink.findOne({ _id: req.params.linkId, owner_id: callerId(req) }).select(
        "clicks last_clicked_at",
      );
      if (!link) throw new AppError(404, "Link not found");
      const today = utcDay(new Date());
      const first = new Date(today.getTime() - (STATS_DAYS - 1) * 86_400_000);
      const rows = await XenLinkDay.find({ link_id: link._id, day: { $gte: first } }).lean();
      const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.n]));
      const days = Array.from({ length: STATS_DAYS }, (_, i) => {
        const day = new Date(first.getTime() + i * 86_400_000).toISOString().slice(0, 10);
        return { day, n: byDay.get(day) ?? 0 };
      });
      return res.json({
        status: true,
        data: {
          clicks: link.clicks ?? 0,
          lastClickedAt: link.last_clicked_at ? link.last_clicked_at.toISOString() : null,
          days,
        },
      });
    },
  );

  // Public: what the link's page shows before it sends you on. The owner and the counts are not included.
  app.get(
    "/api/xenlink/redirect/:slug",
    validateParams(xenLinkSlugParamSchema),
    async function (req: express.Request, res: express.Response) {
      const link = await XenLink.findOne({ slug: req.params.slug })
        .select("name url slug expires_at createdAt updatedAt")
        .exec();
      if (!link) throw new AppError(404, "Link not found");
      if (link.expires_at && link.expires_at <= new Date()) throw new AppError(410, "This link has expired");
      const { expires_at: _expires, ...visible } = link.toObject();
      return res.json({
        status: true,
        data: { link: visible },
      });
    },
  );

  // Public: someone pressed Go. Counts the click and answers with where to go. A POST, so a link preview or a
  // prefetching browser (which only GET) never counts.
  app.post(
    "/api/xenlink/click/:slug",
    clickLimiter,
    validateParams(xenLinkSlugParamSchema),
    async function (req: express.Request, res: express.Response) {
      const link = await XenLink.findOne({ slug: req.params.slug }).select("url expires_at");
      if (!link) throw new AppError(404, "Link not found");
      const now = new Date();
      if (link.expires_at && link.expires_at <= now) throw new AppError(410, "This link has expired");
      // Links saved before addresses were checked may not be web addresses: refuse those rather than send anyone there.
      // Neither refusal is counted: only a click that goes somewhere is.
      const url = normalizeDestination(link.url);
      if (!url) throw new AppError(400, "This link can't be opened");
      await XenLink.updateOne({ _id: link._id }, { $inc: { clicks: 1 }, $set: { last_clicked_at: now } });
      await XenLinkDay.updateOne({ link_id: link._id, day: utcDay(now) }, { $inc: { n: 1 } }, { upsert: true });
      return res.json({ status: true, data: { url } });
    },
  );
};
