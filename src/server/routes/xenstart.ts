import type { Application } from "express";
import type { z } from "zod";
import { MongoServerError } from "mongodb";
import {
  DEFAULT_APPEARANCE,
  HUB_SECTIONS,
  WIDGET_REGIONS,
  defaultXenStartConfig,
  type XenStartAppearance,
  type XenStartConfig,
} from "@shared/xenstart";
import { authenticateToken } from "../middleware/auth";
import { XenStart } from "../models/xenstart";
import { realtime } from "../realtime";
import { AppError, callerId } from "../utils/http";
import { validate, xenStartConfigSchema } from "../utils/validation";

const path = "/api/xenstart";
const conflict = () => new AppError(409, "XenStart changed in another tab. Review the latest settings and try again.");

const projection = { _id: 0, links: 1, engine: 1, sections: 1, revision: 1, appearance: 1, layout: 1 };

function configResponse({
  links,
  engine,
  sections,
  revision,
  appearance,
  layout,
}: Omit<XenStartConfig, "appearance" | "layout"> & {
  layout?: XenStartConfig["layout"] | null;
  appearance?: { [K in keyof XenStartAppearance]?: XenStartAppearance[K] | null } | null;
}): XenStartConfig {
  const widgets = layout && WIDGET_REGIONS.flatMap((region) => layout[region]);
  return {
    links,
    engine,
    sections: widgets ? HUB_SECTIONS.filter((widget) => widgets.includes(widget)) : sections,
    revision,
    ...(layout && { layout }),
    appearance: {
      rows: appearance?.rows ?? DEFAULT_APPEARANCE.rows,
      columns: appearance?.columns ?? DEFAULT_APPEARANCE.columns,
      backgroundUrl: appearance?.backgroundUrl ?? DEFAULT_APPEARANCE.backgroundUrl,
      showClock: widgets?.includes("clock") ?? appearance?.showClock ?? DEFAULT_APPEARANCE.showClock,
    },
  };
}

export default function registerXenStart(app: Application) {
  app.get(path, authenticateToken, async (req, res) => {
    const saved = await XenStart.findOne({ owner_id: callerId(req) }, projection).lean();
    res.json({ status: true, message: "", data: saved ? configResponse(saved) : defaultXenStartConfig() });
  });

  app.put(path, authenticateToken, validate(xenStartConfigSchema), async (req, res) => {
    const owner_id = callerId(req);
    const { revision, ...config } = req.body as z.output<typeof xenStartConfigSchema>;
    const next = { ...config, revision: revision + 1 };
    let data = configResponse(next);
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
      const saved = await XenStart.findOneAndUpdate(
        { owner_id, revision },
        { $set: next },
        { new: true, projection },
      ).lean();
      if (!saved) throw conflict();
      data = configResponse(saved);
    }
    realtime.toUsers([owner_id], "xenstart:update");
    res.json({ status: true, message: "Saved", data });
  });
}
