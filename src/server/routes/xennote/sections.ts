import type { Request, Response } from "express";
import {
  validate,
  validateParams,
  xenNoteIdParamSchema,
  xenNoteSectionCreateSchema,
  xenNoteSectionMoveSchema,
  xenNoteSectionUpdateSchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNotePage, XenNoteSection } from "../../models/xenNotePage";
import { MAX_SECTIONS_PER_NOTEBOOK } from "../../../shared/xennote/pages";
import { orderFor } from "../../utils/xenNoteOrder";
import { trashSection } from "../../utils/xenNotePages";
import { loadNotebook } from "./shared";
import { loadSection, markNotebookChanged, notifyTree, serializeSection, treeEntry } from "./pageAccess";

// Sections: the tabs of a notebook. A notebook's tree (its sections and the pages in them, without bodies) is one
// request. Sections follow the notebook's roles: anyone in it reads, editors and owners change.

const siblingsOf = async (notebookId: unknown, except?: unknown) => {
  const rows = await XenNoteSection.find({ notebook_id: notebookId }, "order").lean();
  return rows.filter((r) => String(r._id) !== String(except)).map((r) => ({ id: String(r._id), order: r.order }));
};

export function registerSectionRoutes(app: any) {
  // The whole notebook at a glance: its sections, and every page in them as a tree entry.
  app.get(
    "/api/xennote/notebooks/:id/tree",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const viewed_at = new Date();
      const notebook = await loadNotebook(req, req.params.id as string, "view");
      const [sections, pages] = await Promise.all([
        XenNoteSection.find({ notebook_id: notebook._id }).sort({ order: 1, _id: 1 }),
        XenNotePage.find({ notebook_id: notebook._id })
          .select("-search_text -members -reminders -share -links -unresolved -files -attachments")
          .sort({ order: 1, _id: 1 }),
      ]);
      res.json({
        status: true,
        data: { viewed_at, sections: sections.map(serializeSection), pages: pages.map((p) => treeEntry(p, uid)) },
      });
    },
  );

  app.post(
    "/api/xennote/notebooks/:id/sections",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteSectionCreateSchema),
    async (req: Request, res: Response) => {
      const notebook = await loadNotebook(req, req.params.id as string, "edit");
      const siblings = await siblingsOf(notebook._id);
      if (siblings.length >= MAX_SECTIONS_PER_NOTEBOOK) {
        throw new AppError(400, `A notebook can have up to ${MAX_SECTIONS_PER_NOTEBOOK} sections`);
      }
      const { name, color, before, after } = xenNoteSectionCreateSchema.parse(req.body); // validate() only checks; parsing again gives the trimmed, defaulted values
      const section = await XenNoteSection.create({
        notebook_id: notebook._id,
        name,
        color: color ?? "default",
        order: orderFor(siblings, { before, after }),
        created_by: callerId(req),
      });
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, message: "Section added", data: { section: serializeSection(section) } });
    },
  );

  app.put(
    "/api/xennote/sections/:id",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteSectionUpdateSchema),
    async (req: Request, res: Response) => {
      const { section, notebook } = await loadSection(req, req.params.id as string, "edit");
      const input = xenNoteSectionUpdateSchema.parse(req.body);
      if (input.name !== undefined) section.name = input.name;
      if (input.color !== undefined) section.color = input.color;
      await section.save();
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, message: "Saved", data: { section: serializeSection(section) } });
    },
  );

  // Put the section before or after another one, or last when neither is named.
  app.post(
    "/api/xennote/sections/:id/move",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteSectionMoveSchema),
    async (req: Request, res: Response) => {
      const { section, notebook } = await loadSection(req, req.params.id as string, "edit");
      const { before, after } = xenNoteSectionMoveSchema.parse(req.body);
      if (before === section.id || after === section.id) throw new AppError(400, "A section can't go next to itself");
      section.order = orderFor(await siblingsOf(notebook._id, section._id), { before, after });
      await section.save();
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, message: "Moved", data: { section: serializeSection(section) } });
    },
  );

  // Deleting a section puts it and its pages in the Trash (they come back with it). The journal and templates sections
  // stay, so a notebook always has one of each once it has them.
  app.delete("/api/xennote/sections/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const { section, notebook } = await loadSection(req, req.params.id as string, "edit");
    if (section.kind !== "normal") throw new AppError(400, "The journal and templates sections can't be deleted");
    await trashSection(section._id, callerId(req));
    await markNotebookChanged(notebook);
    notifyTree(notebook);
    res.json({ status: true, message: "Section deleted" });
  });
}
