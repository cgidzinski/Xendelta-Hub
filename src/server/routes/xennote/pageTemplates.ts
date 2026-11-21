import type { Request, Response } from "express";
import { generateKeyBetween } from "fractional-indexing";
import type { JSONContent } from "@tiptap/core";
import { XenNotebook } from "../../models/xenNote";
import { XenNotePage, XenNotePageBody, XenNoteSection } from "../../models/xenNotePage";
import { AppError, callerId } from "../../utils/http";
import { copyAppFiles } from "../../utils/appFiles";
import { deletePagesForever, filesOfPage, writePageBody, XENNOTE_APP } from "../../utils/xenNotePages";
import {
  validate,
  validateParams,
  xenNoteIdParamSchema,
  xenNoteJournalSchema,
  xenNoteJournalTemplateSchema,
  xenNoteTemplateUseSchema,
} from "../../utils/validation";
import { MAX_PAGES_PER_NOTEBOOK } from "../../../shared/xennote/pages";
import { emptyDoc, ensureBlockIds } from "../../../shared/xennote/pageSchema";
import { loadSection, markNotebookChanged, notifyTree, serializeSection, type PageDoc } from "./pageAccess";
import { loadNotebook, type NotebookDoc } from "./shared";

const duplicate = (error: unknown) => (error as { code?: number }).code === 11000;

async function sectionFor(notebook: NotebookDoc, kind: "journal" | "templates", uid: string) {
  const filter = { notebook_id: notebook._id, kind };
  const current = await XenNoteSection.findOne(filter);
  if (current) return current;
  const last = await XenNoteSection.findOne({ notebook_id: notebook._id }, "order").sort({ order: -1 });
  try {
    return await XenNoteSection.create({
      ...filter,
      name: kind === "journal" ? "Journal" : "Templates",
      order: generateKeyBetween(last?.order ?? null, null),
      created_by: uid,
    });
  } catch (error) {
    if (!duplicate(error)) throw error;
    const existing = await XenNoteSection.findOne(filter);
    if (!existing) throw error;
    return existing;
  }
}

async function templateIn(notebook: NotebookDoc, id: unknown) {
  const section = await XenNoteSection.findOne({ notebook_id: notebook._id, kind: "templates" }, "_id");
  return section ? XenNotePage.findOne({ _id: id, notebook_id: notebook._id, section_id: section._id }) : null;
}

async function initialise(page: PageDoc, uid: string, template: PageDoc | null, date?: string) {
  try {
    if (!template) {
      await XenNotePageBody.create({ page_id: page._id, doc: ensureBlockIds(emptyDoc()), rev: 0 });
      return;
    }
    const [source, files] = await Promise.all([
      XenNotePageBody.findOne({ page_id: template._id }, "doc").lean(),
      filesOfPage(String(template._id), template.files.map(String)),
    ]);
    const remap = new Map<string, string>();
    for (const file of files) {
      const [copy] = await copyAppFiles(uid, { app: XENNOTE_APP, ref: String(page._id) }, [{ fileId: file }]);
      if (!copy) throw new AppError(503, "A template attachment could not be copied.");
      remap.set(file, String(copy._id));
    }
    const clone = (node: JSONContent): JSONContent => {
      const { id: _blockId, ...attrs } = node.attrs ?? {};
      if (node.type === "imageBlock" || node.type === "fileBlock")
        attrs.file_id = remap.get(String(attrs.file_id)) ?? null;
      return {
        ...node,
        ...(node.attrs ? { attrs } : {}),
        ...(node.text && date ? { text: node.text.replaceAll("{{date}}", date) } : {}),
        ...(node.content ? { content: node.content.map(clone) } : {}),
      };
    };
    await writePageBody(page, ensureBlockIds(clone(source?.doc ?? emptyDoc())), uid, 0);
  } catch (error) {
    await deletePagesForever({ _id: page._id });
    throw error;
  }
}

async function reserve(notebook: NotebookDoc, sectionId: unknown, uid: string, title: string, date?: string) {
  if ((await XenNotePage.countDocuments({ notebook_id: notebook._id })) >= MAX_PAGES_PER_NOTEBOOK) {
    throw new AppError(400, `A notebook can have up to ${MAX_PAGES_PER_NOTEBOOK} pages`);
  }
  const last = await XenNotePage.findOne({ section_id: sectionId }, "order").sort({ order: -1 });
  return XenNotePage.create({
    notebook_id: notebook._id,
    section_id: sectionId,
    order: generateKeyBetween(last?.order ?? null, null),
    title,
    journal_date: date ?? null,
    created_by: uid,
    updated_by: uid,
  });
}

export function registerPageTemplateRoutes(app: any) {
  app.post(
    "/api/xennote/notebooks/:id/templates",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const notebook = await loadNotebook(req, req.params.id as string, "edit");
      const section = await sectionFor(notebook, "templates", callerId(req));
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, data: { section: serializeSection(section) } });
    },
  );

  app.put(
    "/api/xennote/notebooks/:id/journal-template",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteJournalTemplateSchema),
    async (req: Request, res: Response) => {
      const notebook = await loadNotebook(req, req.params.id as string, "edit");
      const { page_id } = xenNoteJournalTemplateSchema.parse(req.body);
      if (page_id && !(await templateIn(notebook, page_id))) throw new AppError(404, "Template not found");
      await XenNotebook.updateOne({ _id: notebook._id }, { $set: { journal_template_id: page_id } });
      res.json({ status: true, data: { page_id } });
    },
  );

  app.post(
    "/api/xennote/notebooks/:id/journal",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteJournalSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const notebook = await loadNotebook(req, req.params.id as string, "view");
      const { date } = xenNoteJournalSchema.parse(req.body);
      const filter = { notebook_id: notebook._id, journal_date: date };
      const existing = await XenNotePage.findOne(filter).setOptions({ includeDeleted: true });
      if (existing?.deleted_at) throw new AppError(409, "Restore this journal page from the Trash first.");
      if (existing) return res.json({ status: true, data: { id: existing.id } });
      await loadNotebook(req, req.params.id as string, "edit");
      const section = await sectionFor(notebook, "journal", uid);
      const template = notebook.journal_template_id ? await templateIn(notebook, notebook.journal_template_id) : null;
      let page: PageDoc;
      try {
        page = await reserve(notebook, section._id, uid, date, date);
      } catch (error) {
        if (!duplicate(error)) throw error;
        const same = await XenNotePage.findOne(filter);
        if (!same) throw error;
        return res.json({ status: true, data: { id: same.id } });
      }
      await initialise(page, uid, template, date);
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      return res.json({ status: true, data: { id: page.id } });
    },
  );

  app.post(
    "/api/xennote/sections/:id/from-template",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteTemplateUseSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { notebook, section } = await loadSection(req, req.params.id as string, "edit");
      if (section.kind !== "normal") throw new AppError(400, "Choose a regular section for this page.");
      const { template_id } = xenNoteTemplateUseSchema.parse(req.body);
      const template = await templateIn(notebook, template_id);
      if (!template) throw new AppError(404, "Template not found");
      const page = await reserve(notebook, section._id, uid, template.title);
      await initialise(page, uid, template);
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, data: { id: page.id } });
    },
  );
}
