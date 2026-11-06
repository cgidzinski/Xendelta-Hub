import { Request, Response, NextFunction } from "express";
import sharp from "sharp";
import crypto from "crypto";
const { XenKitchenCategory, XenKitchenItem } = require("../models/xenKitchen");
const { User } = require("../models/user");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
import { uploadXenKitchenImages } from "../config/multer";
import { MAX_XENKITCHEN_IMAGES } from "../constants";
import { uploadToGCS, deleteFromGCS } from "../utils/gcsUtils";
import {
  validate,
  validateParams,
  xenKitchenItemSchema,
  xenKitchenCategorySchema,
  xenKitchenCategoryUpdateSchema,
  xenKitchenCategoryOrderSchema,
  xenKitchenBulkCategorySchema,
  xenKitchenBulkDeleteSchema,
  xenKitchenIdParamSchema,
  xenKitchenImageParamSchema,
  xenKitchenTokenParamSchema,
} from "../utils/validation";
import {
  applyKitchenFilters,
  collectTags,
  CategoryLike,
  generateShareToken,
  itemFieldsFromBody,
  serializeItem,
  suggestIngredients,
} from "../utils/xenKitchen";
import { CATEGORY_ICONS, filtersFromParams, STARTER_CATEGORIES } from "../../shared/xenkitchen/kitchen";

const callerId = (req: Request) => (req as AuthenticatedRequest).user!._id.toString();

const fail = (res: Response, code: number, message: string) =>
  res.status(code).json({ status: false, message });

// Express 5 forwards rejected promises, but a JSON error beats the default HTML page.
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, _next: NextFunction) =>
    fn(req, res).catch((err) => {
      console.error(">>> XenKitchen error:", err);
      if (!res.headersSent) fail(res, 500, "Something went wrong");
    });

const IMAGE_MAX_EDGE = 1600;
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/**
 * Seeds the starter categories the first time someone opens XenKitchen. A per-user flag
 * isn't needed: "has never had a category" is the signal, and someone who deletes them all
 * deliberately gets them back only if they also have no items.
 */
async function ensureCategories(ownerId: string): Promise<any[]> {
  let categories = await XenKitchenCategory.find({ owner_id: ownerId }).sort({ order: 1, created_at: 1 }).lean().exec();
  if (categories.length === 0) {
    const hasItems = await XenKitchenItem.exists({ owner_id: ownerId });
    if (!hasItems) {
      await XenKitchenCategory.insertMany(
        STARTER_CATEGORIES.map((c, i) => ({ ...c, owner_id: ownerId, order: i })),
      );
      categories = await XenKitchenCategory.find({ owner_id: ownerId }).sort({ order: 1 }).lean().exec();
    }
  }
  return categories;
}

const categoryMap = (categories: any[]) =>
  new Map<string, CategoryLike>(categories.map((c) => [String(c._id), c]));

async function categoriesFor(ownerId: string) {
  return categoryMap(await XenKitchenCategory.find({ owner_id: ownerId }).lean().exec());
}

/** 404 rather than 403 for someone else's item, so ids can't be probed. */
async function loadOwnItem(req: Request, res: Response) {
  const item = await XenKitchenItem.findOne({ _id: req.params.id, owner_id: callerId(req) }).exec();
  if (!item) {
    fail(res, 404, "Not found");
    return null;
  }
  return item;
}

/** A category id from the client must be one of the caller's own. */
async function checkCategory(ownerId: string, id: unknown): Promise<boolean> {
  if (!id) return true;
  return !!(await XenKitchenCategory.exists({ _id: id, owner_id: ownerId }));
}

/** Resize to a sensible size, honour EXIF rotation, and re-encode as WebP (GIF stays GIF). */
async function processImage(file: Express.Multer.File): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  if (file.mimetype === "image/gif") return { buffer: file.buffer, contentType: "image/gif", ext: "gif" };
  const buffer = await sharp(file.buffer)
    .rotate()
    .resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { buffer, contentType: "image/webp", ext: "webp" };
}

const deleteImages = (images: Array<{ gcs_path: string }>) =>
  Promise.all(images.map((img) => deleteFromGCS(img.gcs_path, false).catch(() => {})));

async function respondItem(res: Response, item: any, ownerId: string) {
  const categories = await categoriesFor(ownerId);
  res.json({ status: true, message: "OK", data: { item: serializeItem(item, categories) } });
}

module.exports = function (app: any) {
  // ---------- public share link (no auth) ----------

  app.get("/api/xenkitchen/public/:token", validateParams(xenKitchenTokenParamSchema), handle(async (req, res) => {
    const item = await XenKitchenItem.findOne({ "share.token": req.params.token, "share.enabled": true }).lean().exec();
    if (!item) return fail(res, 404, "This link isn't available");
    const categories = await categoriesFor(item.owner_id);
    const owner = await User.findById(item.owner_id, "username").lean().exec();
    res.json({
      status: true,
      message: "OK",
      data: { item: serializeItem(item, categories, { isPublic: true }), owner: owner?.username ?? null },
    });
  }));

  app.post("/api/xenkitchen/public/:token/clone", authenticateToken, validateParams(xenKitchenTokenParamSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const src = await XenKitchenItem.findOne({ "share.token": req.params.token, "share.enabled": true }).lean().exec();
      if (!src) return fail(res, 404, "This link isn't available");
      // Put the copy in a category of the same layout, so instructions stay instructions.
      const srcCategories = await categoriesFor(src.owner_id);
      const layout = src.category_id ? srcCategories.get(String(src.category_id))?.layout ?? "recipe" : "recipe";
      const mine = await ensureCategories(uid);
      const sameName = mine.find((c) => c.name === srcCategories.get(String(src.category_id))?.name && c.layout === layout);
      const target = sameName ?? (layout === "instructions" ? mine.find((c) => c.layout === "instructions") : null);
      const copy = await cloneItem(src, uid, target?._id ?? null);
      await respondItem(res, copy, uid);
    }));

  // ---------- categories ----------

  app.get("/api/xenkitchen/categories", authenticateToken, handle(async (req, res) => {
    const uid = callerId(req);
    const categories = await ensureCategories(uid);
    const counts = await XenKitchenItem.aggregate([
      { $match: { owner_id: uid } },
      { $group: { _id: "$category_id", count: { $sum: 1 } } },
    ]).exec();
    const byId = new Map<string, number>(counts.map((c: any) => [String(c._id), c.count]));
    const known = new Set(categories.map((c) => String(c._id)));
    const total = counts.reduce((s: number, c: any) => s + c.count, 0);
    const uncategorised = counts.filter((c: any) => !c._id || !known.has(String(c._id))).reduce((s: number, c: any) => s + c.count, 0);
    res.json({
      status: true,
      message: "OK",
      data: {
        categories: categories.map((c) => ({
          _id: String(c._id), name: c.name, icon: c.icon, color: c.color, layout: c.layout, order: c.order,
          count: byId.get(String(c._id)) ?? 0,
        })),
        total,
        uncategorised,
      },
    });
  }));

  app.post("/api/xenkitchen/categories", authenticateToken, validate(xenKitchenCategorySchema), handle(async (req, res) => {
    const uid = callerId(req);
    const body = xenKitchenCategorySchema.parse(req.body);
    const count = await XenKitchenCategory.countDocuments({ owner_id: uid });
    if (count >= 50) return fail(res, 400, "That's a lot of categories — 50 is the limit");
    const icon = (CATEGORY_ICONS as readonly string[]).includes(body.icon ?? "") ? body.icon : "restaurant";
    const cat = await XenKitchenCategory.create({ ...body, icon, owner_id: uid, order: count });
    res.json({ status: true, message: "Category created", data: { category: cat } });
  }));

  // Registered before /:id so "order" isn't read as an id.
  app.put("/api/xenkitchen/categories/order", authenticateToken, validate(xenKitchenCategoryOrderSchema), handle(async (req, res) => {
    const uid = callerId(req);
    const { ids } = xenKitchenCategoryOrderSchema.parse(req.body);
    await XenKitchenCategory.bulkWrite(
      ids.map((id, i) => ({ updateOne: { filter: { _id: id, owner_id: uid }, update: { $set: { order: i } } } })),
    );
    res.json({ status: true, message: "Order saved" });
  }));

  app.put("/api/xenkitchen/categories/:id", authenticateToken, validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenCategoryUpdateSchema), handle(async (req, res) => {
      const body = xenKitchenCategoryUpdateSchema.parse(req.body);
      if (body.icon && !(CATEGORY_ICONS as readonly string[]).includes(body.icon)) delete body.icon;
      const cat = await XenKitchenCategory.findOneAndUpdate(
        { _id: req.params.id, owner_id: callerId(req) }, { $set: body }, { new: true },
      ).exec();
      if (!cat) return fail(res, 404, "Category not found");
      res.json({ status: true, message: "Category saved", data: { category: cat } });
    }));

  app.delete("/api/xenkitchen/categories/:id", authenticateToken, validateParams(xenKitchenIdParamSchema), handle(async (req, res) => {
    const uid = callerId(req);
    const cat = await XenKitchenCategory.findOneAndDelete({ _id: req.params.id, owner_id: uid }).exec();
    if (!cat) return fail(res, 404, "Category not found");
    // Items are kept, just uncategorised.
    await XenKitchenItem.updateMany({ owner_id: uid, category_id: cat._id }, { $set: { category_id: null } }).exec();
    res.json({ status: true, message: "Category deleted" });
  }));

  // ---------- autocomplete ----------

  app.get("/api/xenkitchen/ingredients/suggest", authenticateToken, handle(async (req, res) => {
    const items = await XenKitchenItem.find({ owner_id: callerId(req) }, "ingredients.name ingredients.name_key ingredients.unit").lean().exec();
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 60) : "";
    res.json({ status: true, message: "OK", data: { suggestions: suggestIngredients(items, q) } });
  }));

  app.get("/api/xenkitchen/tags", authenticateToken, handle(async (req, res) => {
    const items = await XenKitchenItem.find({ owner_id: callerId(req) }, "tags").lean().exec();
    res.json({ status: true, message: "OK", data: { tags: collectTags(items) } });
  }));

  // ---------- items ----------

  app.get("/api/xenkitchen/items", authenticateToken, handle(async (req, res) => {
    const uid = callerId(req);
    const params = new URLSearchParams(req.url.split("?")[1] || "");
    const filters = filtersFromParams(params);
    const [items, categories] = await Promise.all([
      XenKitchenItem.find({ owner_id: uid }).lean().exec(),
      categoriesFor(uid),
    ]);
    const list = applyKitchenFilters(items, filters, categories).map((i) => serializeItem(i, categories));
    res.json({ status: true, message: "OK", data: { items: list, total: items.length } });
  }));

  app.post("/api/xenkitchen/items", authenticateToken, validate(xenKitchenItemSchema), handle(async (req, res) => {
    const uid = callerId(req);
    const body = xenKitchenItemSchema.parse(req.body);
    if (!(await checkCategory(uid, body.category_id))) return fail(res, 400, "Unknown category");
    const count = await XenKitchenItem.countDocuments({ owner_id: uid });
    if (count >= 5000) return fail(res, 400, "Kitchen is full (5000 items)");
    const item = await XenKitchenItem.create({ ...itemFieldsFromBody(body), owner_id: uid });
    await respondItem(res, item, uid);
  }));

  // Bulk routes sit before /items/:id for the same reason as categories/order.
  app.put("/api/xenkitchen/items/bulk/category", authenticateToken, validate(xenKitchenBulkCategorySchema), handle(async (req, res) => {
    const uid = callerId(req);
    const { ids, category_id } = xenKitchenBulkCategorySchema.parse(req.body);
    if (!(await checkCategory(uid, category_id))) return fail(res, 400, "Unknown category");
    const result = await XenKitchenItem.updateMany(
      { _id: { $in: ids }, owner_id: uid }, { $set: { category_id, updated_at: new Date() } },
    ).exec();
    res.json({ status: true, message: `Moved ${result.modifiedCount}`, data: { moved: result.modifiedCount } });
  }));

  app.post("/api/xenkitchen/items/bulk/delete", authenticateToken, validate(xenKitchenBulkDeleteSchema), handle(async (req, res) => {
    const uid = callerId(req);
    const { ids } = xenKitchenBulkDeleteSchema.parse(req.body);
    const items = await XenKitchenItem.find({ _id: { $in: ids }, owner_id: uid }, "images").lean().exec();
    await XenKitchenItem.deleteMany({ _id: { $in: items.map((i: any) => i._id) }, owner_id: uid }).exec();
    await deleteImages(items.flatMap((i: any) => i.images || []));
    res.json({ status: true, message: `Deleted ${items.length}`, data: { deleted: items.length } });
  }));

  app.get("/api/xenkitchen/items/:id", authenticateToken, validateParams(xenKitchenIdParamSchema), handle(async (req, res) => {
    const item = await loadOwnItem(req, res);
    if (!item) return;
    await respondItem(res, item, callerId(req));
  }));

  app.put("/api/xenkitchen/items/:id", authenticateToken, validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenItemSchema), handle(async (req, res) => {
      const uid = callerId(req);
      const item = await loadOwnItem(req, res);
      if (!item) return;
      const body = xenKitchenItemSchema.parse(req.body);
      if (!(await checkCategory(uid, body.category_id))) return fail(res, 400, "Unknown category");
      item.set(itemFieldsFromBody(body));
      if (body.image_order) {
        const rank = new Map(body.image_order.map((id, i) => [id, i]));
        const sorted = [...item.images].sort(
          (a: any, b: any) => (rank.get(String(a._id)) ?? 99) - (rank.get(String(b._id)) ?? 99),
        );
        item.images = sorted;
      }
      await item.save();
      await respondItem(res, item, uid);
    }));

  app.delete("/api/xenkitchen/items/:id", authenticateToken, validateParams(xenKitchenIdParamSchema), handle(async (req, res) => {
    const item = await loadOwnItem(req, res);
    if (!item) return;
    const images = item.images.map((i: any) => ({ gcs_path: i.gcs_path }));
    await item.deleteOne();
    await deleteImages(images);
    res.json({ status: true, message: "Deleted" });
  }));

  app.post("/api/xenkitchen/items/:id/duplicate", authenticateToken, validateParams(xenKitchenIdParamSchema), handle(async (req, res) => {
    const uid = callerId(req);
    const item = await loadOwnItem(req, res);
    if (!item) return;
    const copy = await cloneItem(item.toObject(), uid, item.category_id, `${item.title || "Untitled"} (copy)`);
    await respondItem(res, copy, uid);
  }));

  // ---------- images ----------

  app.post("/api/xenkitchen/items/:id/images", authenticateToken, validateParams(xenKitchenIdParamSchema),
    uploadXenKitchenImages.array("images", MAX_XENKITCHEN_IMAGES), handle(async (req, res) => {
      const uid = callerId(req);
      const item = await loadOwnItem(req, res);
      if (!item) return;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) return fail(res, 400, "No images provided");
      if (item.images.length + files.length > MAX_XENKITCHEN_IMAGES) {
        return fail(res, 400, `Up to ${MAX_XENKITCHEN_IMAGES} photos per item`);
      }

      for (const file of files) {
        let processed;
        try {
          processed = await processImage(file);
        } catch {
          // Most likely an iPhone HEIC this server can't decode. Safari converts to JPEG on
          // upload, so this is rare; say what to do rather than failing silently.
          return fail(res, 400, `Couldn't read "${file.originalname}". Try a JPEG or PNG.`);
        }
        const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${processed.ext}`;
        const gcsPath = `xenkitchen/${uid}/${item._id}/${name}`;
        const url = (await uploadToGCS(processed.buffer, gcsPath, processed.contentType, false, IMMUTABLE_CACHE)) as string;
        item.images.push({ gcs_path: gcsPath, url });
        // Save after each photo, so one bad file doesn't orphan the ones already stored.
        await item.save();
      }
      await respondItem(res, item, uid);
    }));

  app.delete("/api/xenkitchen/items/:id/images/:imageId", authenticateToken, validateParams(xenKitchenImageParamSchema),
    handle(async (req, res) => {
      const item = await loadOwnItem(req, res);
      if (!item) return;
      const img = item.images.id(req.params.imageId);
      if (!img) return fail(res, 404, "Photo not found");
      const gcsPath = img.gcs_path;
      img.deleteOne();
      await item.save();
      await deleteImages([{ gcs_path: gcsPath }]);
      await respondItem(res, item, callerId(req));
    }));

  // ---------- sharing ----------

  app.post("/api/xenkitchen/items/:id/share", authenticateToken, validateParams(xenKitchenIdParamSchema), handle(async (req, res) => {
    const item = await loadOwnItem(req, res);
    if (!item) return;
    // Turning sharing back on restores the same link; "reset" is how old links get revoked.
    if (!item.share?.token) item.share = { enabled: true, token: generateShareToken() };
    else item.share.enabled = true;
    await item.save();
    await respondItem(res, item, callerId(req));
  }));

  app.post("/api/xenkitchen/items/:id/share/rotate", authenticateToken, validateParams(xenKitchenIdParamSchema), handle(async (req, res) => {
    const item = await loadOwnItem(req, res);
    if (!item) return;
    item.share = { enabled: true, token: generateShareToken() };
    await item.save();
    await respondItem(res, item, callerId(req));
  }));

  app.delete("/api/xenkitchen/items/:id/share", authenticateToken, validateParams(xenKitchenIdParamSchema), handle(async (req, res) => {
    const item = await loadOwnItem(req, res);
    if (!item) return;
    if (item.share) item.share.enabled = false;
    await item.save();
    await respondItem(res, item, callerId(req));
  }));
};

/**
 * Copies an item, including its photos (so deleting the original can't break the copy).
 * Photos that fail to copy are skipped rather than failing the whole clone.
 */
async function cloneItem(src: any, ownerId: string, categoryId: any, title?: string) {
  const fields = itemFieldsFromBody({
    ...src,
    title: title ?? src.title,
    ingredients: (src.ingredients || []).map(({ _id, ...rest }: any) => rest),
    steps: (src.steps || []).map(({ _id, ...rest }: any) => rest),
    methods: (src.methods || []).map(({ _id, ...rest }: any) => rest),
  });
  const copy = new XenKitchenItem({ ...fields, owner_id: ownerId, category_id: categoryId ?? null, favorite: false });
  const { publicBucket } = require("../config/gcs");
  for (const img of src.images || []) {
    const name = img.gcs_path.split("/").pop();
    const dest = `xenkitchen/${ownerId}/${copy._id}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${name}`;
    try {
      await publicBucket.file(img.gcs_path).copy(publicBucket.file(dest));
      copy.images.push({ gcs_path: dest, url: `https://storage.googleapis.com/${publicBucket.name}/${dest}` });
    } catch (e) {
      console.error(">>> XenKitchen photo copy failed:", img.gcs_path, e);
    }
  }
  await copy.save();
  return copy;
}
