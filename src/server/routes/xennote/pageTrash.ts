import type { Request, Response } from "express";
import { validateParams, xenNoteIdParamSchema } from "../../utils/validation";
import { AppError } from "../../utils/http";
import { XenNotePage, XenNoteSection } from "../../models/xenNotePage";
import { purgeDate } from "../../utils/softDelete";
import { deletePagesForever, deleteSectionForever, restorePage, restoreSection } from "../../utils/xenNotePages";
import { loadNotebook } from "./shared";
import { loadPage, loadSection, markNotebookChanged, notifyTree, pageAudience } from "./pageAccess";

// The Trash for a notebook's sections and pages: anyone who can edit the notebook sees what was deleted in it, brings it
// back, or removes it for good. A page deleted with its section (or a sub-page deleted with its page) is not listed on
// its own: it comes back with the one that took it.

export function registerPageTrashRoutes(app: any) {
  app.get(
    "/api/xennote/notebooks/:id/trash",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const notebook = await loadNotebook(req, req.params.id as string, "edit");
      const [sections, pages] = await Promise.all([
        XenNoteSection.find({ notebook_id: notebook._id, deleted_at: { $ne: null } })
          .setOptions({ includeDeleted: true })
          .sort({ deleted_at: -1 })
          .lean(),
        XenNotePage.find({ notebook_id: notebook._id, deleted_at: { $ne: null }, deleted_with: null })
          .setOptions({ includeDeleted: true })
          .select("title section_id parent_id excerpt deleted_at deleted_by")
          .sort({ deleted_at: -1 })
          .limit(500)
          .lean(),
      ]);
      // How many pages went to the Trash with each section.
      const withSection = new Map<string, number>();
      for (const row of await XenNotePage.find(
        { notebook_id: notebook._id, deleted_with: { $in: sections.map((s) => s._id) } },
        "deleted_with",
      )
        .setOptions({ includeDeleted: true })
        .lean()) {
        withSection.set(String(row.deleted_with), (withSection.get(String(row.deleted_with)) ?? 0) + 1);
      }
      res.json({
        status: true,
        data: {
          sections: sections.map((s) => ({
            id: String(s._id),
            name: s.name,
            pages: withSection.get(String(s._id)) ?? 0,
            deleted_at: s.deleted_at,
            purge_at: purgeDate(s.deleted_at as Date),
          })),
          pages: pages.map((p) => ({
            id: String(p._id),
            title: p.title,
            section_id: String(p.section_id),
            excerpt: p.excerpt,
            deleted_at: p.deleted_at,
            purge_at: purgeDate(p.deleted_at as Date),
          })),
        },
      });
    },
  );

  app.post(
    "/api/xennote/pages/:id/restore",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { page, notebook, parent } = await loadPage(req, req.params.id as string, "manage", {
        includeDeleted: true,
      });
      if (!page.deleted_at) throw new AppError(404, "Page not found in the Trash");
      const section = await XenNoteSection.findById(page.section_id).setOptions({ includeDeleted: true });
      if (!section || section.deleted_at) throw new AppError(409, "Restore its section first");
      if (parent?.deleted_at) throw new AppError(409, "Restore its parent page first");
      await restorePage(page._id);
      await markNotebookChanged(notebook);
      notifyTree(notebook, pageAudience(notebook, page, parent));
      res.json({ status: true, message: "Page restored" });
    },
  );

  app.delete(
    "/api/xennote/pages/:id/forever",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { page, notebook } = await loadPage(req, req.params.id as string, "manage", { includeDeleted: true });
      if (!page.deleted_at) throw new AppError(404, "Page not found in the Trash");
      await deletePagesForever({ $or: [{ _id: page._id }, { parent_id: page._id }] });
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, message: "Page deleted for good" });
    },
  );

  app.post(
    "/api/xennote/sections/:id/restore",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { section, notebook } = await loadSection(req, req.params.id as string, "edit", { includeDeleted: true });
      if (!section.deleted_at) throw new AppError(404, "Section not found in the Trash");
      await restoreSection(section._id);
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, message: "Section restored" });
    },
  );

  app.delete(
    "/api/xennote/sections/:id/forever",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { section, notebook } = await loadSection(req, req.params.id as string, "edit", { includeDeleted: true });
      if (!section.deleted_at) throw new AppError(404, "Section not found in the Trash");
      await deleteSectionForever(section._id);
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, message: "Section deleted for good" });
    },
  );

  // Empty the notebook's Trash.
  app.delete(
    "/api/xennote/notebooks/:id/trash",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const notebook = await loadNotebook(req, req.params.id as string, "edit");
      const sections = await XenNoteSection.find({ notebook_id: notebook._id, deleted_at: { $ne: null } }, "_id")
        .setOptions({ includeDeleted: true })
        .lean();
      for (const s of sections) await deleteSectionForever(s._id);
      const removed = await deletePagesForever({ notebook_id: notebook._id, deleted_at: { $ne: null } });
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, message: "Trash emptied", data: { removed } });
    },
  );
}
