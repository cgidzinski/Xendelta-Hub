import type { Application } from "express";
import { MongoServerError } from "mongodb";
import { defaultXenStartConfig, type XenStartConfig } from "@shared/xenstart";
import { authenticateToken } from "../middleware/auth";
import { XenStart } from "../models/xenstart";
import { realtime } from "../realtime";
import { AppError, callerId } from "../utils/http";
import { validate, xenStartConfigSchema } from "../utils/validation";

const path = "/api/xenstart";
const conflict = () => new AppError(409, "XenStart changed in another tab. Review the latest settings and try again.");

export default function registerXenStart(app: Application) {
  app.get(path, authenticateToken, async (req, res) => {
    const saved = await XenStart.findOne(
      { owner_id: callerId(req) },
      { _id: 0, links: 1, engine: 1, sections: 1, revision: 1 },
    ).lean();
    res.json({ status: true, message: "", data: saved ?? defaultXenStartConfig() });
  });

  app.put(path, authenticateToken, validate(xenStartConfigSchema), async (req, res) => {
    const owner_id = callerId(req);
    const { revision, ...config } = req.body as XenStartConfig;
    const next = { ...config, revision: revision + 1 };
    if (revision === 0) {
      try {
        // Ensure the unique owner index is ready before concurrent first saves.
        await XenStart.init();
        await XenStart.create({ owner_id, ...next });
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) throw conflict();
        throw error;
      }
    } else {
      const result = await XenStart.updateOne({ owner_id, revision }, { $set: next });
      if (!result.matchedCount) throw conflict();
    }
    realtime.toUsers([owner_id], "xenstart:update");
    res.json({ status: true, message: "Saved", data: next });
  });
}
