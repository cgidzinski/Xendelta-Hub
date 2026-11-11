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
/** A shared book, or one item opened from it. */
export const XENKITCHEN_BOOK_PATH = /^\/k\/b\/([A-Za-z0-9_-]{22})(?:\/([a-f0-9]{24}))?$/i;

export interface OgKitchenItem {
  title?: string | null;
  description?: string | null;
  brand?: string | null;
  images?: Array<{ url: string }> | null;
}

export function buildKitchenMetaTags(item: OgKitchenItem, pageUrl: string): string {
  const title = escapeHtmlAttribute(item.title || "Untitled");
  const description = escapeHtmlAttribute(
    toPreviewText(item.description) ||
      (item.brand ? `${item.brand} — cooking instructions` : "A recipe from XenKitchen on Xendelta Hub."),
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
/** Resolves a shared book (or an item in it) to preview data; null if not shared. */
export type KitchenBookLoader = (token: string, itemId?: string) => Promise<OgKitchenItem | null>;

export function createKitchenHtmlTransformer(load: KitchenLoader, loadBook: KitchenBookLoader = async () => null) {
  return async function kitchenHtmlTransformer(html: string, req: express.Request): Promise<string> {
    const match = XENKITCHEN_SHARE_PATH.exec(req.path);
    const bookMatch = match ? null : XENKITCHEN_BOOK_PATH.exec(req.path);
    if (!match && !bookMatch) return html;
    let item: OgKitchenItem | null;
    try {
      const work = match ? load(match[1]) : loadBook(bookMatch![1], bookMatch![2]);
      item = await withDeadline(work, OG_LOOKUP_TIMEOUT_MS);
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

const loadSharedBook: KitchenBookLoader = async (token, itemId) => {
  const { XenKitchenBook, XenKitchenItem } = require("../models/xenKitchen");
  const book = await XenKitchenBook.findOne({ "share.token": token, "share.enabled": true })
    .select("name description")
    .maxTimeMS(OG_LOOKUP_TIMEOUT_MS)
    .lean()
    .exec();
  if (!book) return null;
  if (itemId) {
    return XenKitchenItem.findOne({ _id: itemId, book_id: book._id })
      .select("title description brand images")
      .maxTimeMS(OG_LOOKUP_TIMEOUT_MS)
      .lean()
      .exec();
  }
  const cover = await XenKitchenItem.findOne({ book_id: book._id, "images.0": { $exists: true } })
    .sort({ updated_at: -1 })
    .select("images")
    .maxTimeMS(OG_LOOKUP_TIMEOUT_MS)
    .lean()
    .exec();
  return {
    title: book.name,
    description: book.description || "A recipe book on XenKitchen.",
    images: cover?.images ?? [],
  };
};

export const kitchenHtmlTransformer = createKitchenHtmlTransformer(loadSharedItem, loadSharedBook);

type Transformer = (html: string, req: express.Request) => string | Promise<string>;

/** Runs each transformer in turn; each passes non-matching paths through untouched. */
export function composeTransformers(...fns: Transformer[]) {
  return async (html: string, req: express.Request) => {
    let out = html;
    for (const fn of fns) out = await fn(out, req);
    return out;
  };
}
