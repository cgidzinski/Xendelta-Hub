import { Request, Response, NextFunction } from "express";
import sharp from "sharp";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { XenKitchenBook, XenKitchenCategory, XenKitchenItem } from "../models/xenKitchen";
import { User } from "../models/user";
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
import { uploadXenKitchenImages } from "../config/multer";
import { MAX_XENKITCHEN_IMAGES } from "../constants";
import { storeAppFiles, copyAppFiles, removeAppFiles } from "../utils/appFiles";
import { XENKITCHEN_SOURCE, removeKitchenPhotos, withPhotoUrls } from "../utils/xenKitchenFiles";
import { AppError } from "../utils/http";
import { fetchPublicImage, fetchPublicPage } from "../utils/safeFetch";
import { extractRecipe } from "../utils/recipeImport";
import { notify } from "../utils/notificationUtils";
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
  xenKitchenImportUrlSchema,
  xenKitchenImageParamSchema,
  xenKitchenTokenParamSchema,
  xenKitchenBookSchema,
  xenKitchenBookUpdateSchema,
  xenKitchenAddMembersSchema,
  xenKitchenMemberRoleSchema,
  xenKitchenMemberParamSchema,
  xenKitchenMoveSchema,
  xenKitchenBookItemParamSchema,
  xenKitchenPublicCloneParamSchema,
} from "../utils/validation";
import {
  applyKitchenFilters,
  BookLike,
  canEdit,
  canManage,
  canView,
  CategoryLike,
  changeRole,
  collectTags,
  generateShareToken,
  itemFieldsFromBody,
  pickTargetCategory,
  removeMember,
  roleIn,
  serializeItem,
  suggestIngredients,
} from "../utils/xenKitchen";
import { CATEGORY_ICONS, filtersFromParams, STARTER_CATEGORIES } from "@shared/xenkitchen/kitchen";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../utils/publicUser";
import { addRefused } from "../social/policy";

const callerId = (req: Request) => (req as AuthenticatedRequest).user!._id.toString();
const callerName = (req: Request) => (req as AuthenticatedRequest).user!.username;

const fail = (res: Response, code: number, message: string) => res.status(code).json({ status: false, message });

// Express 5 forwards rejected promises, but a JSON error beats the default HTML page.
const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, _next: NextFunction) =>
    fn(req, res).catch((err) => {
      // A deliberate refusal (not enough storage, a photo that can't be read) says why.
      if (err instanceof AppError) return fail(res, err.status, err.message);
      console.error(">>> XenKitchen error:", err);
      if (!res.headersSent) fail(res, 500, "Something went wrong");
    });

/** The file's name with the extension of what it was re-encoded to ("IMG_1.heic" → "IMG_1.webp"). */
const renamed = (name: string, ext: string) => `${name.replace(/\.[^.]*$/, "") || "photo"}.${ext}`;

const IMAGE_MAX_EDGE = 1600;
// Importing makes this server fetch a page for the caller, so it is limited per person (not per address).
const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?._id.toString() ?? "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, message: "Too many imports. Wait a minute and try again." },
});

const validIcon = (icon?: string) => (CATEGORY_ICONS as readonly string[]).includes(icon ?? "");

// ---------- books ----------

const myBooks = (uid: string): Promise<any[]> =>
  XenKitchenBook.find({ "members.user_id": uid }).sort({ created_at: 1 }).lean().exec();

async function createBook(uid: string, fields: { name: string; description?: string; icon?: string; color?: string }) {
  const book = await XenKitchenBook.create({
    ...fields,
    icon: validIcon(fields.icon) ? fields.icon : "restaurant",
    members: [{ user_id: uid, role: "owner" }],
  });
  await XenKitchenCategory.insertMany(STARTER_CATEGORIES.map((c, i) => ({ ...c, book_id: book._id, order: i })));
  return book;
}

const STARTER_BOOK_NAME = "My recipes";

/**
 * Makes the user's starter book exactly once. The first visit fires several requests at the
 * same moment (books, categories, items), and each used to create its own "My recipes".
 * Categories are written first under a pre-chosen id, then the book is inserted against the
 * unique `default_for` index; whichever request loses the race removes its categories.
 */
async function createStarterBook(uid: string): Promise<void> {
  const mongoose = require("mongoose");
  const id = new mongoose.Types.ObjectId();
  await XenKitchenCategory.insertMany(STARTER_CATEGORIES.map((c, i) => ({ ...c, book_id: id, order: i })));
  try {
    await XenKitchenBook.create({
      _id: id,
      name: STARTER_BOOK_NAME,
      icon: "restaurant",
      default_for: uid,
      members: [{ user_id: uid, role: "owner" }],
    });
  } catch (e: any) {
    await XenKitchenCategory.deleteMany({ book_id: id }).exec();
    if (e?.code !== 11000) throw e; // someone else's request made it: fine
  }
}

/** Everyone has at least one book: the first visit makes "My recipes". */
async function ensureBooks(uid: string): Promise<any[]> {
  const books = await myBooks(uid);
  if (books.length) return books;
  await createStarterBook(uid);
  return myBooks(uid);
}

type Need = "view" | "edit" | "manage";
const allowed = (book: BookLike, uid: string, need: Need) =>
  need === "manage" ? canManage(book, uid) : need === "edit" ? canEdit(book, uid) : canView(book, uid);
const denial = (need: Need) =>
  need === "manage" ? "Only the book's owner can do that" : "You can view this book but not change it";

/** Loads a book and checks the caller's role. 404 for non-members so ids can't be probed. */
async function loadBook(req: Request, res: Response, id: unknown, need: Need) {
  const uid = callerId(req);
  const book = id ? await XenKitchenBook.findById(id).exec() : null;
  if (!book || !canView(book, uid)) {
    fail(res, 404, "Book not found");
    return null;
  }
  if (!allowed(book, uid, need)) {
    fail(res, 403, denial(need));
    return null;
  }
  return book;
}

async function loadItem(req: Request, res: Response, need: Need) {
  const uid = callerId(req);
  const item = await XenKitchenItem.findById(req.params.id).exec();
  const book = item ? await XenKitchenBook.findById(item.book_id).lean().exec() : null;
  if (!item || !book || !canView(book, uid)) {
    fail(res, 404, "Not found");
    return null;
  }
  if (!allowed(book, uid, need)) {
    fail(res, 403, denial(need));
    return null;
  }
  return { item, book };
}

async function usernamesFor(ids: Array<string | null | undefined>): Promise<Map<string, any>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  const users = unique.length
    ? await User.find({ _id: { $in: unique } }, PUBLIC_USER_FIELDS)
        .lean()
        .exec()
    : [];
  return new Map(users.map((u: any) => [u._id.toString(), u]));
}

async function categoriesForBooks(bookIds: any[]) {
  const cats = await XenKitchenCategory.find({ book_id: { $in: bookIds } })
    .sort({ order: 1, created_at: 1 })
    .lean()
    .exec();
  return { list: cats as any[], map: new Map<string, CategoryLike>(cats.map((c: any) => [String(c._id), c])) };
}

/** Serializes items for the caller, with book names, roles and who added them. */
async function serializeFor(uid: string, rawItems: any[], books: any[]) {
  const items = await withPhotoUrls(rawItems.map((i) => (typeof i.toObject === "function" ? i.toObject() : i)));
  const { map } = await categoriesForBooks(books.map((b) => b._id));
  const people = await usernamesFor(items.flatMap((i) => [i.created_by, i.updated_by]));
  const usernames = new Map([...people].map(([id, u]) => [id, u.username]));
  const bookMap = new Map<string, BookLike>(books.map((b) => [String(b._id), b]));
  return items.map((i) => serializeItem(i, map, { uid, books: bookMap, usernames }));
}

async function respondItem(res: Response, item: any, book: any, uid: string) {
  const [serialized] = await serializeFor(uid, [item], [book]);
  res.json({ status: true, message: "OK", data: { item: serialized } });
}

async function serializeBook(book: any, uid: string) {
  const people = await usernamesFor(book.members.map((m: any) => m.user_id));
  const counts = await XenKitchenItem.countDocuments({ book_id: book._id });
  const owner = canManage(book, uid);
  return {
    _id: String(book._id),
    name: book.name,
    description: book.description || "",
    icon: book.icon,
    color: book.color,
    my_role: roleIn(book, uid),
    item_count: counts,
    members: book.members.map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      username: people.get(m.user_id)?.username ?? "Unknown",
      avatar: people.get(m.user_id)?.avatar ?? null,
      cosmetics: cosmeticsOf(people.get(m.user_id)),
    })),
    // Only the owner manages the link, so only they see the token.
    share: { enabled: !!book.share?.enabled, token: owner && book.share?.enabled ? (book.share.token ?? null) : null },
  };
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

const categoryBelongs = async (bookId: any, categoryId: unknown) =>
  !categoryId || !!(await XenKitchenCategory.exists({ _id: categoryId, book_id: bookId }));

/**
 * Copies an item into a book, including its photos (so deleting the original can't break
 * the copy). Photos that fail to copy are skipped rather than failing the whole copy.
 */
async function cloneItem(src: any, bookId: any, uid: string, categoryId: any, title?: string) {
  const fields = itemFieldsFromBody({
    ...src,
    title: title ?? src.title,
    ingredients: (src.ingredients || []).map(({ _id, ...rest }: any) => rest),
    steps: (src.steps || []).map(({ _id, ...rest }: any) => rest),
    methods: (src.methods || []).map(({ _id, ...rest }: any) => rest),
  });
  const copy = new XenKitchenItem({
    ...fields,
    book_id: bookId,
    category_id: categoryId ?? null,
    created_by: uid,
    updated_by: uid,
  });
  // The copy is saved first: its photos are tagged to it, and a photo can only be stored for an item that exists.
  await copy.save();
  // Every copy gets its own photos, owned by whoever made the copy, so deleting one item never touches another's.
  const origins = (src.images || []).flatMap((img: any): Array<{ fileId: string } | { publicPath: string }> =>
    img.file_id ? [{ fileId: String(img.file_id) }] : img.gcs_path ? [{ publicPath: img.gcs_path }] : [],
  );
  try {
    const photos = await copyAppFiles(uid, { app: XENKITCHEN_SOURCE, ref: String(copy._id) }, origins);
    if (photos.length > 0) {
      for (const file of photos) copy.images.push({ file_id: file._id, uploaded_by: uid });
      await copy.save();
    }
  } catch (error) {
    // Not enough storage for the photos: no half-copied item either.
    await copy.deleteOne();
    throw error;
  }
  return copy;
}

/** Category for an item arriving from another book (see pickTargetCategory). */
async function targetCategory(srcItem: any, targetBookId: any, requested?: string | null) {
  const [fromCat, target] = await Promise.all([
    srcItem.category_id ? XenKitchenCategory.findById(srcItem.category_id).lean().exec() : null,
    XenKitchenCategory.find({ book_id: targetBookId }).sort({ order: 1 }).lean().exec(),
  ]);
  return pickTargetCategory(target, fromCat ?? undefined, requested);
}

const copyToBookSchema = z.object({
  book_id: z.string().regex(/^[a-f0-9]{24}$/i),
  category_id: z
    .string()
    .regex(/^[a-f0-9]{24}$/i)
    .nullable()
    .optional(),
});
const cloneSchema = z
  .object({
    book_id: z
      .string()
      .regex(/^[a-f0-9]{24}$/i)
      .optional(),
  })
  .optional();

module.exports = function (app: any) {
  // ---------- public links (no auth) ----------

  app.get(
    "/api/xenkitchen/public/:token",
    validateParams(xenKitchenTokenParamSchema),
    handle(async (req, res) => {
      const item = await XenKitchenItem.findOne({ "share.token": req.params.token, "share.enabled": true })
        .lean()
        .exec();
      if (!item) return fail(res, 404, "This link isn't available");
      const { map } = await categoriesForBooks([item.book_id]);
      const creator = item.created_by ? await User.findById(item.created_by, "username").lean().exec() : null;
      const [shown] = await withPhotoUrls([item]);
      res.json({
        status: true,
        message: "OK",
        data: { item: serializeItem(shown, map, { isPublic: true }), owner: creator?.username ?? null },
      });
    }),
  );

  async function loadPublicBook(token: string) {
    return XenKitchenBook.findOne({ "share.token": token, "share.enabled": true }).lean().exec();
  }

  app.get(
    "/api/xenkitchen/public/book/:token",
    validateParams(xenKitchenTokenParamSchema),
    handle(async (req, res) => {
      const book = await loadPublicBook(req.params.token);
      if (!book) return fail(res, 404, "This link isn't available");
      const [items, { list, map }] = await Promise.all([
        XenKitchenItem.find({ book_id: book._id }).sort({ updated_at: -1 }).lean().exec(),
        categoriesForBooks([book._id]),
      ]);
      res.json({
        status: true,
        message: "OK",
        data: {
          book: { name: book.name, description: book.description || "", color: book.color, icon: book.icon },
          categories: list.map((c) => ({
            _id: String(c._id),
            name: c.name,
            icon: c.icon,
            color: c.color,
            layout: c.layout,
          })),
          items: (await withPhotoUrls(items)).map((i: any) => serializeItem(i, map, { isPublic: true })),
        },
      });
    }),
  );

  app.get(
    "/api/xenkitchen/public/book/:token/items/:itemId",
    validateParams(xenKitchenBookItemParamSchema),
    handle(async (req, res) => {
      const book = await loadPublicBook(req.params.token);
      const item = book
        ? await XenKitchenItem.findOne({ _id: req.params.itemId, book_id: book._id }).lean().exec()
        : null;
      if (!book || !item) return fail(res, 404, "This link isn't available");
      const { map } = await categoriesForBooks([book._id]);
      const [shown] = await withPhotoUrls([item]);
      res.json({
        status: true,
        message: "OK",
        data: { item: serializeItem(shown, map, { isPublic: true }), owner: null, book: { name: book.name } },
      });
    }),
  );

  /** Save a shared item into one of my books (the given one, else the first I can edit). */
  app.post(
    ["/api/xenkitchen/public/:token/clone", "/api/xenkitchen/public/book/:token/items/:itemId/clone"],
    authenticateToken,
    validateParams(xenKitchenPublicCloneParamSchema),
    validate(cloneSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      let src: any;
      if (req.params.itemId) {
        const book = await loadPublicBook(String(req.params.token));
        src = book ? await XenKitchenItem.findOne({ _id: req.params.itemId, book_id: book._id }).lean().exec() : null;
      } else {
        src = await XenKitchenItem.findOne({ "share.token": req.params.token, "share.enabled": true }).lean().exec();
      }
      if (!src) return fail(res, 404, "This link isn't available");
      const books = await ensureBooks(uid);
      const wanted = req.body?.book_id;
      const target = wanted
        ? books.find((b) => String(b._id) === wanted && canEdit(b, uid))
        : books.find((b) => canEdit(b, uid));
      if (!target) return fail(res, 400, "You don't have a book you can add to");
      const copy = await cloneItem(src, target._id, uid, await targetCategory(src, target._id));
      await respondItem(res, copy, target, uid);
    }),
  );

  // ---------- books ----------

  app.get(
    "/api/xenkitchen/books",
    authenticateToken,
    handle(async (req, res) => {
      const uid = callerId(req);
      const books = await ensureBooks(uid);
      res.json({
        status: true,
        message: "OK",
        data: { books: await Promise.all(books.map((b) => serializeBook(b, uid))) },
      });
    }),
  );

  app.post(
    "/api/xenkitchen/books",
    authenticateToken,
    validate(xenKitchenBookSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const body = xenKitchenBookSchema.parse(req.body);
      const owned = await XenKitchenBook.countDocuments({ members: { $elemMatch: { user_id: uid, role: "owner" } } });
      if (owned >= 30) return fail(res, 400, "30 books is the limit");
      const book = await createBook(uid, body);
      res.json({ status: true, message: "Book created", data: { book: await serializeBook(book.toObject(), uid) } });
    }),
  );

  app.put(
    "/api/xenkitchen/books/:id",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenBookUpdateSchema),
    handle(async (req, res) => {
      const book = await loadBook(req, res, req.params.id, "manage");
      if (!book) return;
      const body = xenKitchenBookUpdateSchema.parse(req.body);
      if (body.icon && !validIcon(body.icon)) delete body.icon;
      book.set(body);
      await book.save();
      res.json({ status: true, message: "Saved", data: { book: await serializeBook(book.toObject(), callerId(req)) } });
    }),
  );

  app.delete(
    "/api/xenkitchen/books/:id",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const book = await loadBook(req, res, req.params.id, "manage");
      if (!book) return;
      const items = await XenKitchenItem.find({ book_id: book._id }, "images").lean().exec();
      await XenKitchenItem.deleteMany({ book_id: book._id }).exec();
      await XenKitchenCategory.deleteMany({ book_id: book._id }).exec();
      await book.deleteOne();
      await removeKitchenPhotos(items.flatMap((i: any) => i.images || []));
      await ensureBooks(uid);
      res.json({ status: true, message: "Book deleted" });
    }),
  );

  app.post(
    "/api/xenkitchen/books/:id/members",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenAddMembersSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const book = await loadBook(req, res, req.params.id, "manage");
      if (!book) return;
      const { userIds, role } = xenKitchenAddMembersSchema.parse(req.body);
      if (addRefused(res, uid, userIds)) return;
      const found = await User.find({ _id: { $in: userIds } }, "_id")
        .lean()
        .exec();
      const existing = new Set(book.members.map((m: any) => m.user_id));
      const added = found.map((u: any) => u._id.toString()).filter((id: string) => !existing.has(id));
      if (book.members.length + added.length > 50) return fail(res, 400, "50 people per book is the limit");
      added.forEach((id: string) => book.members.push({ user_id: id, role }));
      await book.save();
      await Promise.all(
        added.map((id: string) =>
          notify(id, {
            title: "Recipe book shared with you",
            message: `${callerName(req)} added you to "${book.name}" as ${role === "viewer" ? "a viewer" : "an editor"}.`,
            link: `/internal/xenkitchen?book=${book._id}`,
          }).catch(() => {}),
        ),
      );
      res.json({
        status: true,
        message: added.length ? `Added ${added.length}` : "Already members",
        data: { book: await serializeBook(book.toObject(), uid) },
      });
    }),
  );

  app.put(
    "/api/xenkitchen/books/:id/members/:userId",
    authenticateToken,
    validateParams(xenKitchenMemberParamSchema),
    validate(xenKitchenMemberRoleSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const book = await loadBook(req, res, req.params.id, "view");
      if (!book) return;
      const result = changeRole(book.toObject(), uid, String(req.params.userId), req.body.role);
      if (!result.ok) return fail(res, result.code, result.message);
      book.set("members", result.members);
      // Handed to someone else, it's no longer the old owner's starter book; clearing the
      // marker lets them get a fresh one if they later leave and have none.
      if (req.body.role === "owner") book.default_for = undefined;
      await book.save();
      res.json({ status: true, message: "Saved", data: { book: await serializeBook(book.toObject(), uid) } });
    }),
  );

  app.delete(
    "/api/xenkitchen/books/:id/members/:userId",
    authenticateToken,
    validateParams(xenKitchenMemberParamSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const book = await loadBook(req, res, req.params.id, "view");
      if (!book) return;
      const target = String(req.params.userId);
      const result = removeMember(book.toObject(), uid, target);
      if (!result.ok) return fail(res, result.code, result.message);
      book.set("members", result.members);
      await book.save();
      // Their stars on this book's items go with them.
      await XenKitchenItem.updateMany({ book_id: book._id }, { $pull: { favorited_by: target } }).exec();
      if (target === uid) await ensureBooks(uid);
      res.json({
        status: true,
        message: target === uid ? "You left the book" : "Removed",
        data: target === uid ? {} : { book: await serializeBook(book.toObject(), uid) },
      });
    }),
  );

  const bookShare = (action: "enable" | "disable" | "rotate") =>
    handle(async (req, res) => {
      const book = await loadBook(req, res, req.params.id, "manage");
      if (!book) return;
      if (action === "rotate" || !book.share?.token)
        book.share = { enabled: action !== "disable", token: generateShareToken() };
      else book.share.enabled = action === "enable";
      await book.save();
      res.json({ status: true, message: "OK", data: { book: await serializeBook(book.toObject(), callerId(req)) } });
    });
  app.post(
    "/api/xenkitchen/books/:id/share",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    bookShare("enable"),
  );
  app.post(
    "/api/xenkitchen/books/:id/share/rotate",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    bookShare("rotate"),
  );
  app.delete(
    "/api/xenkitchen/books/:id/share",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    bookShare("disable"),
  );

  // ---------- categories ----------

  /** ?book=<id> for one book, or ?book=all (default) for every book I'm in. */
  app.get(
    "/api/xenkitchen/categories",
    authenticateToken,
    handle(async (req, res) => {
      const uid = callerId(req);
      const books = await ensureBooks(uid);
      const which = typeof req.query.book === "string" ? req.query.book : "all";
      const scope = which === "all" ? books : books.filter((b) => String(b._id) === which);
      if (!scope.length) return fail(res, 404, "Book not found");
      const ids = scope.map((b) => b._id);
      const [{ list }, counts] = await Promise.all([
        categoriesForBooks(ids),
        XenKitchenItem.aggregate([
          { $match: { book_id: { $in: ids } } },
          { $group: { _id: "$category_id", count: { $sum: 1 } } },
        ]).exec(),
      ]);
      const byId = new Map<string, number>(counts.map((c: any) => [String(c._id), c.count]));
      const known = new Set(list.map((c) => String(c._id)));
      const total = counts.reduce((s: number, c: any) => s + c.count, 0);
      const uncategorised = counts
        .filter((c: any) => !c._id || !known.has(String(c._id)))
        .reduce((s: number, c: any) => s + c.count, 0);
      res.json({
        status: true,
        message: "OK",
        data: {
          categories: list.map((c) => ({
            _id: String(c._id),
            book_id: String(c.book_id),
            name: c.name,
            icon: c.icon,
            color: c.color,
            layout: c.layout,
            order: c.order,
            count: byId.get(String(c._id)) ?? 0,
          })),
          total,
          uncategorised,
        },
      });
    }),
  );

  const createCategorySchema = xenKitchenCategorySchema.extend({ book_id: z.string().regex(/^[a-f0-9]{24}$/i) });
  app.post(
    "/api/xenkitchen/categories",
    authenticateToken,
    validate(createCategorySchema),
    handle(async (req, res) => {
      const body = createCategorySchema.parse(req.body);
      const book = await loadBook(req, res, body.book_id, "edit");
      if (!book) return;
      const count = await XenKitchenCategory.countDocuments({ book_id: book._id });
      if (count >= 50) return fail(res, 400, "That's a lot of categories — 50 is the limit");
      const cat = await XenKitchenCategory.create({
        ...body,
        book_id: book._id,
        icon: validIcon(body.icon) ? body.icon : "restaurant",
        order: count,
      });
      res.json({ status: true, message: "Category created", data: { category: cat } });
    }),
  );

  // Registered before /:id so "order" isn't read as an id.
  const orderSchema = xenKitchenCategoryOrderSchema.extend({ book_id: z.string().regex(/^[a-f0-9]{24}$/i) });
  app.put(
    "/api/xenkitchen/categories/order",
    authenticateToken,
    validate(orderSchema),
    handle(async (req, res) => {
      const { ids, book_id } = orderSchema.parse(req.body);
      const book = await loadBook(req, res, book_id, "edit");
      if (!book) return;
      await XenKitchenCategory.bulkWrite(
        ids.map((id, i) => ({ updateOne: { filter: { _id: id, book_id: book._id }, update: { $set: { order: i } } } })),
      );
      res.json({ status: true, message: "Order saved" });
    }),
  );

  async function loadCategory(req: Request, res: Response) {
    const cat = await XenKitchenCategory.findById(req.params.id).exec();
    if (!cat) {
      fail(res, 404, "Category not found");
      return null;
    }
    const book = await loadBook(req, res, cat.book_id, "edit");
    return book ? cat : null;
  }

  app.put(
    "/api/xenkitchen/categories/:id",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenCategoryUpdateSchema),
    handle(async (req, res) => {
      const cat = await loadCategory(req, res);
      if (!cat) return;
      const body = xenKitchenCategoryUpdateSchema.parse(req.body);
      if (body.icon && !validIcon(body.icon)) delete body.icon;
      cat.set(body);
      await cat.save();
      res.json({ status: true, message: "Category saved", data: { category: cat } });
    }),
  );

  app.delete(
    "/api/xenkitchen/categories/:id",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    handle(async (req, res) => {
      const cat = await loadCategory(req, res);
      if (!cat) return;
      await cat.deleteOne();
      // Items are kept, just uncategorised.
      await XenKitchenItem.updateMany(
        { book_id: cat.book_id, category_id: cat._id },
        { $set: { category_id: null } },
      ).exec();
      res.json({ status: true, message: "Category deleted" });
    }),
  );

  // ---------- autocomplete (across every book I'm in, so a housemate's ingredients count) ----------

  const myBookIds = async (uid: string) => (await myBooks(uid)).map((b) => b._id);

  app.get(
    "/api/xenkitchen/ingredients/suggest",
    authenticateToken,
    handle(async (req, res) => {
      const items = await XenKitchenItem.find(
        { book_id: { $in: await myBookIds(callerId(req)) } },
        "ingredients.name ingredients.name_key ingredients.unit",
      )
        .lean()
        .exec();
      const q = typeof req.query.q === "string" ? req.query.q.slice(0, 60) : "";
      res.json({ status: true, message: "OK", data: { suggestions: suggestIngredients(items, q) } });
    }),
  );

  app.get(
    "/api/xenkitchen/tags",
    authenticateToken,
    handle(async (req, res) => {
      const items = await XenKitchenItem.find({ book_id: { $in: await myBookIds(callerId(req)) } }, "tags")
        .lean()
        .exec();
      res.json({ status: true, message: "OK", data: { tags: collectTags(items) } });
    }),
  );

  // ---------- items ----------

  app.get(
    "/api/xenkitchen/items",
    authenticateToken,
    handle(async (req, res) => {
      const uid = callerId(req);
      const params = new URLSearchParams(req.url.split("?")[1] || "");
      const filters = filtersFromParams(params);
      const books = await ensureBooks(uid);
      const which = params.get("book") || "all";
      const scope = which === "all" ? books : books.filter((b) => String(b._id) === which);
      if (!scope.length) return fail(res, 404, "Book not found");
      const items = await XenKitchenItem.find({ book_id: { $in: scope.map((b) => b._id) } })
        .lean()
        .exec();
      const { map } = await categoriesForBooks(scope.map((b) => b._id));
      const filtered = applyKitchenFilters(items, filters, map, uid);
      res.json({
        status: true,
        message: "OK",
        data: { items: await serializeFor(uid, filtered, scope), total: items.length },
      });
    }),
  );

  const createItemSchema = xenKitchenItemSchema.extend({ book_id: z.string().regex(/^[a-f0-9]{24}$/i) });
  app.post(
    "/api/xenkitchen/items",
    authenticateToken,
    validate(createItemSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const body = createItemSchema.parse(req.body);
      const book = await loadBook(req, res, body.book_id, "edit");
      if (!book) return;
      if (!(await categoryBelongs(book._id, body.category_id)))
        return fail(res, 400, "That category isn't in this book");
      const count = await XenKitchenItem.countDocuments({ book_id: book._id });
      if (count >= 5000) return fail(res, 400, "This book is full (5000 items)");
      const item = await XenKitchenItem.create({
        ...itemFieldsFromBody(body),
        book_id: book._id,
        created_by: uid,
        updated_by: uid,
      });
      await respondItem(res, item, book.toObject(), uid);
    }),
  );

  /** For bulk actions: the ids among these that sit in books the caller can edit. */
  async function editableIds(uid: string, ids: string[]) {
    const books = (await myBooks(uid)).filter((b) => canEdit(b, uid));
    const items = await XenKitchenItem.find(
      { _id: { $in: ids }, book_id: { $in: books.map((b) => b._id) } },
      "book_id images",
    )
      .lean()
      .exec();
    return items as any[];
  }

  // Bulk routes sit before /items/:id for the same reason as categories/order.
  app.put(
    "/api/xenkitchen/items/bulk/category",
    authenticateToken,
    validate(xenKitchenBulkCategorySchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const { ids, category_id } = xenKitchenBulkCategorySchema.parse(req.body);
      const items = await editableIds(uid, ids);
      let moved: number;
      if (category_id) {
        // A category belongs to one book, so only that book's items can go into it.
        const cat = await XenKitchenCategory.findById(category_id).lean().exec();
        if (!cat) return fail(res, 400, "Unknown category");
        const inBook = items.filter((i) => String(i.book_id) === String(cat.book_id)).map((i) => i._id);
        if (!inBook.length) return fail(res, 400, "Those items aren't in that category's book");
        moved = (
          await XenKitchenItem.updateMany(
            { _id: { $in: inBook } },
            { $set: { category_id, updated_at: new Date(), updated_by: uid } },
          ).exec()
        ).modifiedCount;
      } else {
        moved = (
          await XenKitchenItem.updateMany(
            { _id: { $in: items.map((i) => i._id) } },
            { $set: { category_id: null, updated_at: new Date(), updated_by: uid } },
          ).exec()
        ).modifiedCount;
      }
      res.json({ status: true, message: `Moved ${moved}`, data: { moved } });
    }),
  );

  app.post(
    "/api/xenkitchen/items/bulk/delete",
    authenticateToken,
    validate(xenKitchenBulkDeleteSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const { ids } = xenKitchenBulkDeleteSchema.parse(req.body);
      const items = await editableIds(uid, ids);
      await XenKitchenItem.deleteMany({ _id: { $in: items.map((i) => i._id) } }).exec();
      await removeKitchenPhotos(items.flatMap((i) => i.images || []));
      res.json({ status: true, message: `Deleted ${items.length}`, data: { deleted: items.length } });
    }),
  );

  app.get(
    "/api/xenkitchen/items/:id",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    handle(async (req, res) => {
      const loaded = await loadItem(req, res, "view");
      if (!loaded) return;
      await respondItem(res, loaded.item, loaded.book, callerId(req));
    }),
  );

  app.put(
    "/api/xenkitchen/items/:id",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenItemSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const { item, book } = loaded;
      const body = xenKitchenItemSchema.parse(req.body);
      if (!(await categoryBelongs(book._id, body.category_id)))
        return fail(res, 400, "That category isn't in this book");
      item.set({ ...itemFieldsFromBody(body), updated_by: uid });
      if (body.image_order) {
        const rank = new Map(body.image_order.map((id, i) => [id, i]));
        item.set(
          "images",
          [...item.images].sort((a: any, b: any) => (rank.get(String(a._id)) ?? 99) - (rank.get(String(b._id)) ?? 99)),
        );
      }
      await item.save();
      await respondItem(res, item, book, uid);
    }),
  );

  app.delete(
    "/api/xenkitchen/items/:id",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    handle(async (req, res) => {
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const images = loaded.item.images.map((i: any) => ({ file_id: i.file_id, gcs_path: i.gcs_path }));
      await loaded.item.deleteOne();
      await removeKitchenPhotos(images);
      res.json({ status: true, message: "Deleted" });
    }),
  );

  // Favorites are per person and allowed for viewers too.
  const setFavorite = (on: boolean) =>
    handle(async (req, res) => {
      const uid = callerId(req);
      const loaded = await loadItem(req, res, "view");
      if (!loaded) return;
      await XenKitchenItem.updateOne(
        { _id: loaded.item._id },
        on ? { $addToSet: { favorited_by: uid } } : { $pull: { favorited_by: uid } },
      ).exec();
      const fresh = await XenKitchenItem.findById(loaded.item._id).lean().exec();
      await respondItem(res, fresh, loaded.book, uid);
    });
  app.post(
    "/api/xenkitchen/items/:id/favorite",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    setFavorite(true),
  );
  app.delete(
    "/api/xenkitchen/items/:id/favorite",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    setFavorite(false),
  );

  app.post(
    "/api/xenkitchen/items/:id/duplicate",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const { item, book } = loaded;
      const copy = await cloneItem(
        item.toObject(),
        book._id,
        uid,
        item.category_id,
        `${item.title || "Untitled"} (copy)`,
      );
      await respondItem(res, copy, book, uid);
    }),
  );

  /** Copy into another book. Viewers of the source may copy, into a book they can edit. */
  app.post(
    "/api/xenkitchen/items/:id/copy",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    validate(copyToBookSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const loaded = await loadItem(req, res, "view");
      if (!loaded) return;
      const target = await loadBook(req, res, req.body.book_id, "edit");
      if (!target) return;
      const src = loaded.item.toObject();
      const copy = await cloneItem(src, target._id, uid, await targetCategory(src, target._id, req.body.category_id));
      await respondItem(res, copy, target.toObject(), uid);
    }),
  );

  app.put(
    "/api/xenkitchen/items/:id/move",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenMoveSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const target = await loadBook(req, res, req.body.book_id, "edit");
      if (!target) return;
      const { item } = loaded;
      if (String(item.book_id) !== String(target._id)) {
        item.set("category_id", await targetCategory(item, target._id, req.body.category_id));
        item.book_id = target._id;
        // Stars belong to people; keep only those of people who can see the new book.
        const members = new Set(target.members.map((m: any) => m.user_id));
        item.favorited_by = item.favorited_by.filter((u: string) => members.has(u));
        item.updated_by = uid;
        await item.save();
      }
      await respondItem(res, item, target.toObject(), uid);
    }),
  );

  // ---------- import from a web address ----------

  // Fetch a recipe page and read the recipe out of it. Nothing is saved: the editor shows the result for review.
  app.post(
    "/api/xenkitchen/import-url",
    authenticateToken,
    importLimiter,
    validate(xenKitchenImportUrlSchema),
    handle(async (req, res) => {
      const { url } = xenKitchenImportUrlSchema.parse(req.body);
      const page = await fetchPublicPage(url);
      const recipe = extractRecipe(page.body.toString("utf8"), page.url);
      if (!recipe) {
        throw new AppError(
          422,
          "Couldn't find a recipe on that page. Some sites don't publish their recipes in a way that can be read.",
        );
      }
      res.json({ status: true, message: "Recipe found", data: { recipe } });
    }),
  );

  // Add a picture from a web address (the recipe's photo on the page it was imported from) to an item.
  app.post(
    "/api/xenkitchen/items/:id/images/from-url",
    authenticateToken,
    importLimiter,
    validateParams(xenKitchenIdParamSchema),
    validate(xenKitchenImportUrlSchema),
    handle(async (req, res) => {
      const uid = callerId(req);
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const { item, book } = loaded;
      if (item.images.length >= MAX_XENKITCHEN_IMAGES) {
        return fail(res, 400, `Up to ${MAX_XENKITCHEN_IMAGES} photos per item`);
      }
      const { url } = xenKitchenImportUrlSchema.parse(req.body);
      const fetched = await fetchPublicImage(url);
      const mimetype = fetched.contentType.split(";")[0].trim().toLowerCase();
      let processed;
      try {
        // The same resizing as an uploaded photo; a picture that can't be decoded is refused.
        processed = await processImage({ buffer: fetched.body, mimetype } as Express.Multer.File);
      } catch {
        throw new AppError(400, "Couldn't read that picture");
      }
      const name = renamed(new URL(fetched.url).pathname.split("/").pop() || "photo", processed.ext);
      const stored = await storeAppFiles(uid, { app: XENKITCHEN_SOURCE, ref: String(item._id) }, [
        { buffer: processed.buffer, mimeType: processed.contentType, name },
      ]);
      for (const file of stored) item.images.push({ file_id: file._id, uploaded_by: uid });
      item.updated_by = uid;
      try {
        await item.save();
      } catch (error) {
        await removeAppFiles(stored.map((f) => f._id));
        throw error;
      }
      await respondItem(res, item, book, uid);
    }),
  );

  // ---------- images ----------

  app.post(
    "/api/xenkitchen/items/:id/images",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    uploadXenKitchenImages.array("images", MAX_XENKITCHEN_IMAGES),
    handle(async (req, res) => {
      const uid = callerId(req);
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const { item, book } = loaded;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) return fail(res, 400, "No images provided");
      if (item.images.length + files.length > MAX_XENKITCHEN_IMAGES) {
        return fail(res, 400, `Up to ${MAX_XENKITCHEN_IMAGES} photos per item`);
      }

      // Resize them all first, so one unreadable file fails the request before anything is stored.
      const processed = await Promise.all(
        files.map(async (file) => {
          try {
            const image = await processImage(file);
            return { buffer: image.buffer, mimeType: image.contentType, name: renamed(file.originalname, image.ext) };
          } catch {
            // Most likely an iPhone HEIC this server can't decode. Safari converts to JPEG on
            // upload, so this is rare; say what to do rather than failing silently.
            throw new AppError(400, `Couldn't read "${file.originalname}". Try a JPEG or PNG.`);
          }
        }),
      );
      // Stored as private XenDrive files owned by the uploader (tagged to this item); all or nothing.
      const stored = await storeAppFiles(uid, { app: XENKITCHEN_SOURCE, ref: String(item._id) }, processed);
      for (const file of stored) item.images.push({ file_id: file._id, uploaded_by: uid });
      item.updated_by = uid;
      try {
        await item.save();
      } catch (error) {
        await removeAppFiles(stored.map((f) => f._id));
        throw error;
      }
      await respondItem(res, item, book, uid);
    }),
  );

  app.delete(
    "/api/xenkitchen/items/:id/images/:imageId",
    authenticateToken,
    validateParams(xenKitchenImageParamSchema),
    handle(async (req, res) => {
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const { item, book } = loaded;
      const img = item.images.id(req.params.imageId);
      if (!img) return fail(res, 404, "Photo not found");
      const removed = { file_id: img.file_id, gcs_path: img.gcs_path };
      img.deleteOne();
      await item.save();
      await removeKitchenPhotos([removed]);
      await respondItem(res, item, book, callerId(req));
    }),
  );

  // ---------- single-item public link (editors manage it) ----------

  const itemShare = (action: "enable" | "disable" | "rotate") =>
    handle(async (req, res) => {
      const loaded = await loadItem(req, res, "edit");
      if (!loaded) return;
      const { item, book } = loaded;
      // Turning sharing back on restores the same link; "reset" is how old links get revoked.
      if (action === "rotate" || !item.share?.token)
        item.share = { enabled: action !== "disable", token: generateShareToken() };
      else item.share.enabled = action === "enable";
      await item.save();
      await respondItem(res, item, book, callerId(req));
    });
  app.post(
    "/api/xenkitchen/items/:id/share",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    itemShare("enable"),
  );
  app.post(
    "/api/xenkitchen/items/:id/share/rotate",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    itemShare("rotate"),
  );
  app.delete(
    "/api/xenkitchen/items/:id/share",
    authenticateToken,
    validateParams(xenKitchenIdParamSchema),
    itemShare("disable"),
  );
};
