import type express from "express";
import {
  OG_LOOKUP_TIMEOUT_MS,
  escapeHtmlAttribute,
  injectMetaTags,
  toPreviewText,
  withDeadline,
} from "./recipaintOgMeta";

// Same idea as the Recipaint previews: crawlers don't run JS, so a shared /k/:token link
// needs its Open Graph tags in the HTML the server sends.

export const XENKITCHEN_SHARE_PATH = /^\/k\/([A-Za-z0-9_-]{22})$/;

export interface OgKitchenItem {
  title?: string | null;
  description?: string | null;
  brand?: string | null;
  images?: Array<{ url: string }> | null;
}

export function buildKitchenMetaTags(item: OgKitchenItem, pageUrl: string): string {
  const title = escapeHtmlAttribute(item.title || "Untitled");
  const description = escapeHtmlAttribute(
    toPreviewText(item.description) || (item.brand ? `${item.brand} — cooking instructions` : "A recipe from XenKitchen on Xendelta Hub."),
  );
  const image = item.images?.[0]?.url;
  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="XenKitchen · Xendelta Hub" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtmlAttribute(pageUrl)}" />`,
    `<meta name="description" content="${description}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtmlAttribute(image)}" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtmlAttribute(image)}" />`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }
  return tags.join("\n    ");
}

/** Resolves only shared items; anything else is null. */
export type KitchenLoader = (token: string) => Promise<OgKitchenItem | null>;

export function createKitchenHtmlTransformer(load: KitchenLoader) {
  return async function kitchenHtmlTransformer(html: string, req: express.Request): Promise<string> {
    const match = XENKITCHEN_SHARE_PATH.exec(req.path);
    if (!match) return html;
    let item: OgKitchenItem | null;
    try {
      item = await withDeadline(load(match[1]), OG_LOOKUP_TIMEOUT_MS);
    } catch {
      return html;
    }
    if (!item) return html;
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    return injectMetaTags(html, buildKitchenMetaTags(item, `${base}${req.path}`), item.title || "XenKitchen");
  };
}

const loadSharedItem: KitchenLoader = (token) => {
  const { XenKitchenItem } = require("../models/xenKitchen");
  return XenKitchenItem.findOne({ "share.token": token, "share.enabled": true })
    .select("title description brand images")
    .maxTimeMS(OG_LOOKUP_TIMEOUT_MS)
    .lean()
    .exec();
};

export const kitchenHtmlTransformer = createKitchenHtmlTransformer(loadSharedItem);

type Transformer = (html: string, req: express.Request) => string | Promise<string>;

/** Runs each transformer in turn; each passes non-matching paths through untouched. */
export function composeTransformers(...fns: Transformer[]) {
  return async (html: string, req: express.Request) => {
    let out = html;
    for (const fn of fns) out = await fn(out, req);
    return out;
  };
}
