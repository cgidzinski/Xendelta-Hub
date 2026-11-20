import type { Request, Response } from "express";
import { validateParams, xenNotePublicNotebookPageParamSchema, xenNoteTokenParamSchema } from "../../utils/validation";
import { AppError } from "../../utils/http";
import { XenNote, XenNotebook } from "../../models/xenNote";
import { XenNotePage, XenNotePageBody, XenNoteSection } from "../../models/xenNotePage";
import { emptyDoc } from "../../../shared/xennote/pageSchema";
import { fileMapFor } from "./pages";
import { existsLegacyNote, migratedLink } from "./legacy";
import { serializePublicNote } from "./shared";

const visible = { archived: { $ne: true } };

async function publicPage(page: { _id: unknown; title: string; files: unknown[]; updated_at?: Date | null }) {
  const [body, files] = await Promise.all([
    XenNotePageBody.findOne({ page_id: page._id }, "doc").lean(),
    fileMapFor(page.files),
  ]);
  return { id: String(page._id), title: page.title, updated_at: page.updated_at, doc: body?.doc ?? emptyDoc(), files };
}

// Public links: read-only views for anyone holding the link. Registered before the auth middleware.
export function registerPublicNoteRoutes(app: any) {
  app.get(
    "/api/xennote/public/note/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const token = req.params.token as string;
      const note = await existsLegacyNote(token);
      if (note) return res.json({ status: true, data: { note: await serializePublicNote(note) } });
      const page = await migratedLink(token);
      if (!page || !(await XenNotebook.exists({ _id: page.notebook_id }))) throw new AppError(404, "Link not found");
      return res.json({ status: true, data: { page_id: page.id as string } });
    },
  );

  app.get(
    "/api/xennote/public/notebook/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const book = await XenNotebook.findOne({ "share.token": req.params.token, "share.enabled": true });
      if (!book) throw new AppError(404, "Link not found");
      const [notes, sections, pages] = await Promise.all([
        XenNote.find({ notebook_id: book._id, ...visible })
          .sort({ pinned: -1, updated_at: -1 })
          .limit(500),
        XenNoteSection.find({ notebook_id: book._id }, "name order").sort({ order: 1, _id: 1 }).lean(),
        XenNotePage.find({ notebook_id: book._id, ...visible }, "title section_id parent_id order")
          .sort({ order: 1, _id: 1 })
          .lean(),
      ]);
      const sectionIds = new Set(sections.map((s) => String(s._id)));
      const inSection = pages.filter((p) => sectionIds.has(String(p.section_id)));
      const roots = new Set(inSection.filter((p) => !p.parent_id).map((p) => String(p._id)));
      res.json({
        status: true,
        data: {
          notebook: { name: book.name, color: book.color },
          notes: await Promise.all(notes.map((n) => serializePublicNote(n))),
          sections: sections.map((s) => ({ id: String(s._id), name: s.name })),
          pages: inSection
            .filter((p) => !p.parent_id || roots.has(String(p.parent_id)))
            .map((p) => ({
              id: String(p._id),
              title: p.title,
              section_id: String(p.section_id),
              parent_id: p.parent_id ? String(p.parent_id) : null,
            })),
        },
      });
    },
  );
  app.get(
    "/api/xennote/public/page/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const page = await XenNotePage.findOne({ "share.token": req.params.token, "share.enabled": true });
      if (!page || !(await XenNotebook.exists({ _id: page.notebook_id }))) throw new AppError(404, "Link not found");
      res.json({ status: true, data: await publicPage(page) });
    },
  );

  app.get(
    "/api/xennote/public/notebook/:token/pages/:id",
    validateParams(xenNotePublicNotebookPageParamSchema),
    async (req: Request, res: Response) => {
      const { token, id } = xenNotePublicNotebookPageParamSchema.parse(req.params);
      const book = await XenNotebook.findOne({ "share.token": token, "share.enabled": true }, "_id").lean();
      if (!book) throw new AppError(404, "Link not found");
      const page = await XenNotePage.findOne({ _id: id, notebook_id: book._id, ...visible });
      if (!page) throw new AppError(404, "Link not found");
      const [section, parent] = await Promise.all([
        XenNoteSection.exists({ _id: page.section_id, notebook_id: book._id }),
        page.parent_id ? XenNotePage.exists({ _id: page.parent_id, section_id: page.section_id, ...visible }) : true,
      ]);
      if (!section || !parent) throw new AppError(404, "Link not found");
      res.json({ status: true, data: await publicPage(page) });
    },
  );
}
