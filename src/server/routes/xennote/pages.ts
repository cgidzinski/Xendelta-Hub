import type { Request, Response } from "express";
import {
  validate,
  validateParams,
  xenNoteIdParamSchema,
  xenNotePageBodySchema,
  xenNotePageCreateSchema,
  xenNotePageFavoriteSchema,
  xenNotePageMoveSchema,
  xenNotePageUpdateSchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { FileRecord } from "../../models/fileRecord";
import { XenNotePage, XenNotePageBody, XenNoteSection } from "../../models/xenNotePage";
import { signedUrlsFor, thumbnailUrlsFor } from "../../utils/appFiles";
import { canView } from "../../utils/membership";
import { orderFor } from "../../utils/xenNoteOrder";
import { filesOfPage, keepPageVersion, referencedFileIds, sanitizePageDoc, trashPage } from "../../utils/xenNotePages";
import { SocketManager } from "../../infrastructure/SocketManager";
import { deriveFromDoc } from "../../../shared/xennote/deriveFromDoc";
import { PAGE_SCHEMA_VERSION, MAX_PAGES_PER_NOTEBOOK, MAX_PAGE_TAGS } from "../../../shared/xennote/pages";
import { checkPageDoc, emptyDoc, ensureBlockIds } from "../../../shared/xennote/pageSchema";
import {
  canManagePage,
  loadPage,
  loadSection,
  notifyTree,
  pageAudience,
  serializePage,
  type PageDoc,
} from "./pageAccess";
import type { NotebookDoc } from "./shared";
import type { MemberRole } from "../../utils/membership";

// Pages: create, read, rename and recolour, save the text, move, star and delete. A page's text is its own document
// (XenNotePageBody); the page row holds only what lists need plus what is worked out from the text on each save.

const URL_MINUTES = 60;

/** The files a page shows, with a short-lived link to each, by id. */
async function fileMapFor(fileIds: unknown[]) {
  const ids = fileIds.map(String);
  if (ids.length === 0) return {};
  const [rows, urls, thumbs] = await Promise.all([
    FileRecord.find({ _id: { $in: ids } }, "name size mimeType").lean(),
    signedUrlsFor(ids, URL_MINUTES),
    thumbnailUrlsFor(ids),
  ]);
  return Object.fromEntries(
    rows.map((r) => [
      String(r._id),
      {
        name: r.name,
        size: r.size,
        mime: r.mimeType,
        url: urls.get(String(r._id)) ?? null,
        thumbUrl: thumbs.get(String(r._id)) ?? null,
      },
    ]),
  );
}

/** A page with its text, as the person opening it sees it. */
export async function pageDetail(page: PageDoc, notebook: NotebookDoc, role: MemberRole, uid: string) {
  const [body, section] = await Promise.all([
    XenNotePageBody.findOne({ page_id: page._id }).lean(),
    XenNoteSection.findById(page.section_id).lean(),
  ]);
  // Someone who was added to this page alone sees the page, not the notebook around it.
  const member = canView(notebook.toObject(), uid);
  return {
    page: serializePage(page, uid, role, canManagePage(notebook.toObject(), uid)),
    doc: body?.doc ?? ensureBlockIds(emptyDoc()),
    files: await fileMapFor(page.files),
    notebook: member ? { id: notebook.id as string, name: notebook.name } : null,
    section: member && section ? { id: String(section._id), name: section.name, kind: section.kind } : null,
  };
}

const siblingsOf = async (sectionId: unknown, parentId: unknown, except?: unknown) => {
  const rows = await XenNotePage.find({ section_id: sectionId, parent_id: parentId }, "order").lean();
  return rows.filter((r) => String(r._id) !== String(except)).map((r) => ({ id: String(r._id), order: r.order }));
};

/** The tags a page shows: those written in the text and those added as properties, each once. */
const unionTags = (inline: string[], manual: string[]) => [...new Set([...inline, ...manual])].slice(0, MAX_PAGE_TAGS);

export function registerPageRoutes(app: any) {
  app.post(
    "/api/xennote/sections/:id/pages",
    validateParams(xenNoteIdParamSchema),
    validate(xenNotePageCreateSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { section, notebook } = await loadSection(req, req.params.id as string, "edit");
      if (section.kind === "journal") throw new AppError(400, "Journal pages are made from the journal");
      if ((await XenNotePage.countDocuments({ notebook_id: notebook._id })) >= MAX_PAGES_PER_NOTEBOOK) {
        throw new AppError(400, `A notebook can have up to ${MAX_PAGES_PER_NOTEBOOK} pages`);
      }
      const { title, parent_id, before, after } = xenNotePageCreateSchema.parse(req.body); // validate() only checks; parsing again gives the trimmed, defaulted values

      let parent: PageDoc | null = null;
      if (parent_id) {
        parent = await XenNotePage.findOne({ _id: parent_id, section_id: section._id });
        if (!parent) throw new AppError(400, "That parent page isn't in this section");
        if (parent.parent_id) throw new AppError(400, "A sub-page can't have sub-pages of its own");
      }
      const page = await XenNotePage.create({
        notebook_id: notebook._id,
        section_id: section._id,
        parent_id: parent?._id ?? null,
        order: orderFor(await siblingsOf(section._id, parent?._id ?? null), { before, after }),
        title,
        created_by: uid,
        updated_by: uid,
      });
      await XenNotePageBody.create({ page_id: page._id, doc: ensureBlockIds(emptyDoc()), rev: 0 });
      notifyTree(
        notebook,
        parent?.members.map((m) => m.user_id),
      );
      res.json({ status: true, message: "Page added", data: await pageDetail(page, notebook, "owner", uid) });
    },
  );

  app.get("/api/xennote/pages/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { page, notebook, role } = await loadPage(req, req.params.id as string, "view");
    res.json({ status: true, data: await pageDetail(page, notebook, role, uid) });
  });

  // Name, icon, colour, archive, tags and aliases. The text is saved on its own (below).
  app.put(
    "/api/xennote/pages/:id",
    validateParams(xenNoteIdParamSchema),
    validate(xenNotePageUpdateSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page, notebook, parent, role } = await loadPage(req, req.params.id as string, "edit");
      const body = xenNotePageUpdateSchema.parse(req.body);
      if (body.title !== undefined) page.title = body.title;
      if (body.icon !== undefined) page.icon = body.icon;
      if (body.color !== undefined) page.color = body.color;
      if (body.archived !== undefined) page.archived = body.archived;
      if (body.aliases !== undefined) page.set("aliases", body.aliases);
      if (body.tags_manual !== undefined) {
        page.set("tags_manual", body.tags_manual);
        page.set("tags", unionTags(page.tags_inline, body.tags_manual));
      }
      page.updated_by = uid;
      await page.save();
      notifyTree(notebook, pageAudience(notebook, page, parent));
      res.json({ status: true, message: "Saved", data: await pageDetail(page, notebook, role, uid) });
    },
  );

  // Save the text. `base_rev` is the revision the editor started from. A save over a newer revision still goes through
  // (the last save wins for now) but keeps what it replaced as a version and says so with `conflict`.
  app.put(
    "/api/xennote/pages/:id/body",
    validateParams(xenNoteIdParamSchema),
    validate(xenNotePageBodySchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page, notebook, parent } = await loadPage(req, req.params.id as string, "edit");
      const { doc, base_rev } = xenNotePageBodySchema.parse(req.body);

      const checked = checkPageDoc(doc);
      if (!checked.ok) throw new AppError(400, checked.reason);
      const allowed = await filesOfPage(page.id as string, referencedFileIds(checked.doc));
      // Through JSON, so no `undefined` is stored as null.
      const clean = JSON.parse(JSON.stringify(sanitizePageDoc(checked.doc, allowed)));
      const derived = deriveFromDoc(clean);

      const before = await XenNotePageBody.findOne({ page_id: page._id }).lean();
      const conflict = base_rev !== page.rev;
      if (before && JSON.stringify(before.doc) !== JSON.stringify(clean)) {
        await keepPageVersion(
          page._id,
          { doc: before.doc, title: page.title, files: page.files, at: before.updated_at, by: page.updated_by ?? null },
          conflict,
        );
      }

      const now = new Date();
      const saved = await XenNotePage.findOneAndUpdate(
        { _id: page._id },
        {
          $set: {
            links: derived.links,
            unresolved: derived.unresolved,
            tags_inline: derived.tags,
            tags: unionTags(derived.tags, page.tags_manual),
            files: derived.files,
            search_text: derived.search_text,
            excerpt: derived.excerpt,
            todo: derived.todo,
            word_count: derived.word_count,
            updated_by: uid,
            updated_at: now,
          },
          $inc: { rev: 1 },
        },
        { new: true },
      );
      if (!saved) throw new AppError(404, "Page not found");
      await XenNotePageBody.findOneAndUpdate(
        { page_id: page._id },
        { $set: { doc: clean, schema_version: PAGE_SCHEMA_VERSION, rev: saved.rev, updated_at: now } },
        { upsert: true },
      );

      SocketManager.getInstance().notifyXenNotePageUpdate(pageAudience(notebook, page, parent), {
        pageId: page.id as string,
        notebookId: notebook.id as string,
        rev: saved.rev,
        by: uid,
      });
      res.json({ status: true, message: "Saved", data: { rev: saved.rev, conflict } });
    },
  );

  // Move a page to another section, make it a sub-page (or top-level), and put it before or after a sibling.
  app.post(
    "/api/xennote/pages/:id/move",
    validateParams(xenNoteIdParamSchema),
    validate(xenNotePageMoveSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page, notebook, parent: oldParent, role } = await loadPage(req, req.params.id as string, "manage");
      const { section_id, parent_id, before, after } = xenNotePageMoveSchema.parse(req.body);
      if (page.journal_date) throw new AppError(400, "Journal pages stay in the journal");
      if (before === page.id || after === page.id) throw new AppError(400, "A page can't go next to itself");

      const sectionChanged = !!section_id && section_id !== String(page.section_id);
      if (sectionChanged) {
        const target = await XenNoteSection.findOne({ _id: section_id, notebook_id: notebook._id });
        if (!target) throw new AppError(400, "That section isn't in this notebook");
        if (target.kind === "journal") throw new AppError(400, "Pages can't be moved into the journal");
      }
      const sectionId = sectionChanged ? (section_id as string) : String(page.section_id);
      const parentId =
        parent_id !== undefined ? parent_id : sectionChanged ? null : page.parent_id ? String(page.parent_id) : null;

      if (parentId) {
        if (parentId === page.id) throw new AppError(400, "A page can't be its own parent");
        const parent = await XenNotePage.findOne({ _id: parentId, section_id: sectionId });
        if (!parent) throw new AppError(400, "That parent page isn't in this section");
        if (parent.parent_id) throw new AppError(400, "A sub-page can't have sub-pages of its own");
        if (await XenNotePage.exists({ parent_id: page._id })) {
          throw new AppError(400, "A page with sub-pages can't become a sub-page");
        }
      }

      page.set("section_id", sectionId);
      page.set("parent_id", parentId);
      page.order = orderFor(await siblingsOf(sectionId, parentId, page._id), { before, after });
      page.updated_by = uid;
      await page.save();
      // Its sub-pages go with it.
      if (sectionChanged) await XenNotePage.updateMany({ parent_id: page._id }, { $set: { section_id: sectionId } });
      notifyTree(notebook, pageAudience(notebook, page, oldParent));
      res.json({ status: true, message: "Moved", data: await pageDetail(page, notebook, role, uid) });
    },
  );

  // Star or un-star a page. Favourites are each person's own.
  app.post(
    "/api/xennote/pages/:id/favorite",
    validateParams(xenNoteIdParamSchema),
    validate(xenNotePageFavoriteSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page, notebook, role } = await loadPage(req, req.params.id as string, "edit");
      await XenNotePage.updateOne(
        { _id: page._id },
        xenNotePageFavoriteSchema.parse(req.body).favorite
          ? { $addToSet: { favorited_by: uid } }
          : { $pull: { favorited_by: uid } },
      );
      const fresh = await XenNotePage.findById(page._id);
      res.json({ status: true, data: await pageDetail(fresh ?? page, notebook, role, uid) });
    },
  );

  // Deleting a page puts it and its sub-pages in the Trash for 30 days.
  app.delete("/api/xennote/pages/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const { page, notebook, parent } = await loadPage(req, req.params.id as string, "manage");
    const audience = pageAudience(notebook, page, parent);
    await trashPage(page._id, callerId(req));
    notifyTree(notebook, audience);
    res.json({ status: true, message: "Page deleted" });
  });
}
