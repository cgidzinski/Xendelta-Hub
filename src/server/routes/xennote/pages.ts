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
  xenNoteReminderSchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { FileRecord } from "../../models/fileRecord";
import { XenNotePage, XenNotePageBody, XenNoteSection } from "../../models/xenNotePage";
import { signedUrlsFor, thumbnailUrlsFor } from "../../utils/appFiles";
import { canView } from "../../utils/membership";
import { orderFor } from "../../utils/xenNoteOrder";
import { trashPage, unionTags, writePageBody } from "../../utils/xenNotePages";
import { SocketManager } from "../../infrastructure/SocketManager";
import { MAX_PAGES_PER_NOTEBOOK } from "../../../shared/xennote/pages";
import { emptyDoc, ensureBlockIds } from "../../../shared/xennote/pageSchema";
import {
  canManagePage,
  loadPage,
  loadSection,
  markNotebookChanged,
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
export async function fileMapFor(fileIds: unknown[]) {
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
  const children = !member
    ? await XenNotePage.find({ parent_id: page._id, archived: { $ne: true } }, "title")
        .sort({ order: 1, _id: 1 })
        .lean()
    : [];
  const own = page.reminders.find((item) => item.user_id === uid);
  return {
    properties: page.properties,
    reminder: own ? { at: own.at, sent: !!own.notified_at } : null,
    children: children.map((p) => ({ id: String(p._id), title: p.title })),
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
      await markNotebookChanged(notebook);
      notifyTree(
        notebook,
        parent?.members.map((m) => m.user_id),
      );
      res.json({ status: true, message: "Page added", data: await pageDetail(page, notebook, "owner", uid) });
    },
  );

  app.get("/api/xennote/pages/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const viewed_at = new Date();
    const uid = callerId(req);
    const { page, notebook, role } = await loadPage(req, req.params.id as string, "view");
    res.json({ status: true, data: { ...(await pageDetail(page, notebook, role, uid)), viewed_at } });
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
      await markNotebookChanged(notebook);
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
      const { doc, base_rev, client_id } = xenNotePageBodySchema.parse(req.body);

      const { rev, conflict } = await writePageBody(page, doc, uid, base_rev);

      await markNotebookChanged(notebook);
      SocketManager.getInstance().notifyXenNotePageUpdate(pageAudience(notebook, page, parent), {
        pageId: page.id as string,
        notebookId: notebook.id as string,
        rev,
        by: uid,
        client: client_id,
      });
      res.json({ status: true, message: "Saved", data: { rev, conflict } });
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
      await markNotebookChanged(notebook);
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

  app.put(
    "/api/xennote/pages/:id/reminder",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteReminderSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page } = await loadPage(req, req.params.id as string, "view");
      const { at } = xenNoteReminderSchema.parse(req.body);
      // Preserve other people's reminders and atomically replace or remove this caller's own reminder.
      const remaining = {
        $filter: { input: { $ifNull: ["$reminders", []] }, as: "r", cond: { $ne: ["$$r.user_id", uid] } },
      };
      const reminder = at ? { user_id: uid, at: new Date(at), notified_at: null } : null;
      const update = reminder ? { $concatArrays: [remaining, [reminder]] } : remaining;
      const changed = await XenNotePage.updateOne({ _id: page._id }, [{ $set: { reminders: update } }]);
      if (!changed.matchedCount) throw new AppError(404, "Page not found");
      res.json({ status: true, data: { reminder: reminder ? { at: reminder.at, sent: false } : null } });
    },
  );

  // Deleting a page puts it and its sub-pages in the Trash for 30 days.
  app.delete("/api/xennote/pages/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const { page, notebook, parent } = await loadPage(req, req.params.id as string, "manage");
    const audience = pageAudience(notebook, page, parent);
    await trashPage(page._id, callerId(req));
    await markNotebookChanged(notebook);
    notifyTree(notebook, audience);
    res.json({ status: true, message: "Page deleted" });
  });
}
