import { randomUUID } from "node:crypto";
import type { Application, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import type { z } from "zod";
import { MongoServerError } from "mongodb";
import {
  BACKGROUND_UPLOAD_LIMIT,
  DEFAULT_APPEARANCE,
  REGION_HEIGHT_SHARES,
  type RegionStyles,
  type RegionStyle,
  withRegionStyle,
  HUB_SECTIONS,
  WIDGET_REGIONS,
  defaultXenStartConfig,
  parseQuickLinkUrl,
  type BookmarkMetadata,
  type XenStartAppearance,
  type XenStartConfig,
} from "@shared/xenstart";
import { parsePreview } from "../chat/linkPreview";
import { authenticateToken } from "../middleware/auth";
import { XenStart } from "../models/xenstart";
import { realtime } from "../realtime";
import { AppError, callerId } from "../utils/http";
import { fetchPublic } from "../utils/safeFetch";
import {
  validate,
  validateParams,
  xenStartBackgroundParams,
  xenStartBookmarkSchema,
  xenStartConfigSchema,
} from "../utils/validation";

const path = "/api/xenstart";
const conflict = () => new AppError(409, "XenStart changed in another tab. Review the latest settings and try again.");
const bookmarkLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: callerId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, message: "Too many bookmark lookups. Try again in a minute." },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BACKGROUND_UPLOAD_LIMIT, files: 1, fields: 1 },
}).single("background");

const readBackgroundUpload: RequestHandler = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE")
      return next(new AppError(413, "Choose a background image under 10 MB."));
    if (error || !req.file) return next(new AppError(400, "Choose a background image."));
    try {
      req.body = JSON.parse(req.body.config);
    } catch {
      return next(new AppError(400, "Invalid XenStart settings."));
    }
    next();
  });
};

async function processBackground(buffer: Buffer) {
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000 });
    const { format } = await image.metadata();
    if (!format || !["jpeg", "png", "webp", "gif", "avif", "heif"].includes(format)) throw new Error();
    return await image.rotate().resize(1920, 1920, { fit: "inside", withoutEnlargement: true }).webp().toBuffer();
  } catch {
    throw new AppError(400, "Choose a supported image: JPEG, PNG, WebP, GIF or AVIF.");
  }
}

async function bookmarkMetadata(url: URL): Promise<BookmarkMetadata> {
  const fallback = { label: url.hostname.replace(/^www\./i, "").slice(0, 80) };
  try {
    const page = await fetchPublic(url.href, { kind: "html", maxBytes: 512 * 1024, timeoutMs: 5000 });
    const html = page.body.toString("utf8").slice(0, 200_000);
    let iconUrl: string | undefined;
    for (const [tag] of html.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
      const attrs = new Map(
        [...tag.matchAll(/([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
          ([, key, quoted, single, bare]) => [key.toLowerCase(), quoted ?? single ?? bare],
        ),
      );
      const href = attrs.get("href");
      if (!href || !attrs.get("rel")?.toLowerCase().split(/\s+/).includes("icon")) continue;
      try {
        const candidate = new URL(href, page.url).href;
        if (candidate.length <= 2048 && parseQuickLinkUrl(candidate)) {
          iconUrl = candidate;
          break;
        }
      } catch {
        continue;
      }
    }
    const label = parsePreview(html, page.url)?.title.slice(0, 80).trimEnd() || fallback.label;
    return { label, iconUrl: iconUrl ?? new URL("/favicon.ico", page.url).href };
  } catch {
    return fallback;
  }
}

const projection = {
  _id: 0,
  links: 1,
  engine: 1,
  sections: 1,
  revision: 1,
  appearance: 1,
  layout: 1,
  clockFormat: 1,
  clockSize: 1,
  linkTileSize: 1,
  backgroundFit: 1,
  "backgroundImage.id": 1,
  regionStyles: 1,
};

function configResponse({
  links,
  engine,
  sections,
  revision,
  appearance,
  layout,
  clockFormat,
  clockSize,
  linkTileSize,
  backgroundFit,
  backgroundImage,
  regionStyles,
}: Pick<XenStartConfig, "engine" | "sections" | "revision"> & {
  links: Array<
    Omit<XenStartConfig["links"][number], "iconUrl" | "slot"> & { iconUrl?: string | null; slot?: number | null }
  >;
  regionStyles?: Partial<
    Record<
      (typeof WIDGET_REGIONS)[number],
      { height?: number | null; alignment?: RegionStyle["alignment"] | null; paddingTop?: number | null } | null
    >
  > | null;
  clockFormat?: XenStartConfig["clockFormat"] | null;
  clockSize?: XenStartConfig["clockSize"] | null;
  linkTileSize?: XenStartConfig["linkTileSize"] | null;
  backgroundFit?: XenStartConfig["backgroundFit"] | null;
  backgroundImage?: { id?: string | null } | null;
  layout?: XenStartConfig["layout"] | null;
  appearance?: { [K in keyof XenStartAppearance]?: XenStartAppearance[K] | null } | null;
}): XenStartConfig {
  const widgets = layout && WIDGET_REGIONS.flatMap((region) => layout[region]);
  let styles: RegionStyles | undefined;
  if (regionStyles) {
    styles = {};
    for (const region of WIDGET_REGIONS) {
      const style = regionStyles[region];
      if (!style) continue;
      const { height, alignment, paddingTop } = style;
      styles = withRegionStyle(styles, region, {
        height: height === null ? null : REGION_HEIGHT_SHARES.find((share) => share === height),
        alignment: alignment ?? undefined,
        paddingTop: paddingTop ?? undefined,
      });
    }
  }
  return {
    links: links.map(({ id, label, url, iconUrl, slot }) => ({
      id,
      label,
      url,
      ...(iconUrl && { iconUrl }),
      ...(slot != null && { slot }),
    })),
    engine,
    sections: widgets ? HUB_SECTIONS.filter((widget) => widgets.includes(widget)) : sections,
    revision,
    ...(layout && { layout }),
    ...(styles && { regionStyles: styles }),
    ...(clockFormat && { clockFormat }),
    ...(clockSize && { clockSize }),
    ...(linkTileSize && { linkTileSize }),
    ...(backgroundFit && { backgroundFit }),
    ...(backgroundImage?.id && { backgroundImageId: backgroundImage.id }),
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

  app.post(
    `${path}/bookmark`,
    authenticateToken,
    bookmarkLimiter,
    validate(xenStartBookmarkSchema),
    async (req, res) => {
      const data = await bookmarkMetadata(new URL(req.body.url));
      res.json({ status: true, message: "", data });
    },
  );

  app.get(
    `${path}/background/:imageId`,
    authenticateToken,
    validateParams(xenStartBackgroundParams),
    async (req, res) => {
      const saved = await XenStart.findOne({
        owner_id: callerId(req),
        "backgroundImage.id": req.params.imageId,
      }).select("backgroundImage.data");
      if (!saved?.backgroundImage?.data) throw new AppError(404, "Background image not found.");
      res.set("Cache-Control", "private, no-store").type("image/webp").send(saved.backgroundImage.data);
    },
  );

  app.put(path, authenticateToken, readBackgroundUpload, validate(xenStartConfigSchema), async (req, res) => {
    const owner_id = callerId(req);
    const { revision, backgroundImageId, ...config } = req.body as z.output<typeof xenStartConfigSchema>;
    const backgroundImage = req.file ? { id: randomUUID(), data: await processBackground(req.file.buffer) } : undefined;
    const next = {
      ...config,
      revision: revision + 1,
      ...(backgroundImage && {
        backgroundImage,
        appearance: { ...(config.appearance ?? DEFAULT_APPEARANCE), backgroundUrl: "" },
      }),
    };
    const clearImage = !backgroundImage && (backgroundImageId === null || !!config.appearance?.backgroundUrl);
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
        { $set: next, ...(clearImage && { $unset: { backgroundImage: 1 } }) },
        { new: true, projection },
      ).lean();
      if (!saved) throw conflict();
      data = configResponse(saved);
    }
    realtime.toUsers([owner_id], "xenstart:update");
    res.json({ status: true, message: "Saved", data });
  });
}
