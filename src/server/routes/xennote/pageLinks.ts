import type { Request, Response } from "express";
import { escapeRegex } from "@shared/regex";
import {
  validate,
  validateParams,
  validateQuery,
  xenNoteIdParamSchema,
  xenNoteLinkMentionSchema,
  xenNotePeekSchema,
  xenNoteSuggestQuerySchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNotebook } from "../../models/xenNote";
import { XenNotePage, XenNotePageBody } from "../../models/xenNotePage";
import { SocketManager } from "../../infrastructure/SocketManager";
import { canEdit } from "../../utils/membership";
import { writePageBody } from "../../utils/xenNotePages";
import { searchPages, visiblePagesFilter } from "../../utils/xenNotePageSearch";
import { findMention, linkFirstMention, mentionSnippet } from "../../../shared/xennote/linkMention";
import { normalizeTitle } from "../../../shared/xennote/wikiLinks";
import { loadPage, notebookAudience } from "./pageAccess";

// Links between pages. A link names a page by id, so what a link shows is looked up when it is drawn ("peek"), and only
// for pages the person can see: any other page, and any id that is no page at all, answers the same way (locked), so
// ids can't be used to find out what exists.

const MAX_RELATED = 50;

export function registerPageLinkRoutes(app: any) {
  // What a list of links should show: the page's name, or that it is locked. (A POST only because the list can be long.)
  app.post("/api/xennote/pages/peek", validate(xenNotePeekSchema), async (req: Request, res: Response) => {
    const { ids } = xenNotePeekSchema.parse(req.body);
    const visible = await visiblePagesFilter(callerId(req));
    const rows = await XenNotePage.find(
      { $and: [visible, { _id: { $in: ids } }] },
      "title notebook_id section_id color icon archived",
    ).lean();
    const found = new Map(rows.map((r) => [String(r._id), r]));
    res.json({
      status: true,
      data: {
        pages: ids.map((id) => {
          const r = found.get(id);
          if (!r) return { id, locked: true as const };
          return {
            id,
            locked: false as const,
            title: r.title,
            notebook_id: String(r.notebook_id),
            section_id: String(r.section_id),
            color: r.color,
            icon: r.icon ?? null,
            archived: r.archived,
          };
        }),
      },
    });
  });

  // The pages to offer while someone types "[[…": by title or alias, this notebook's first. With nothing typed, the pages
  // changed most recently.
  app.get(
    "/api/xennote/pages/suggest",
    validateQuery(xenNoteSuggestQuerySchema),
    async (req: Request, res: Response) => {
      const { q, notebook } = xenNoteSuggestQuerySchema.parse(req.query);
      const hits = await searchPages(callerId(req), { q, namesOnly: true, recent: true, limit: 40 });
      const mine = (h: { notebook_id: string }) => (h.notebook_id === notebook ? 0 : 1);
      res.json({ status: true, data: { pages: hits.sort((a, b) => mine(a) - mine(b)).slice(0, 10) } });
    },
  );

  // Pages that link here: by id, and in this notebook those that wrote [[this title]] (or an alias) before the page existed.
  app.get(
    "/api/xennote/pages/:id/backlinks",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page } = await loadPage(req, req.params.id as string, "view");
      const names = [page.title, ...page.aliases].map(normalizeTitle).filter(Boolean);
      const visible = await visiblePagesFilter(uid);
      const rows = await XenNotePage.find(
        {
          $and: [
            visible,
            { _id: { $ne: page._id } },
            { $or: [{ links: page._id }, { notebook_id: page.notebook_id, unresolved: { $in: names } }] },
          ],
        },
        "title notebook_id section_id excerpt search_text",
      )
        .sort({ updated_at: -1 })
        .limit(MAX_RELATED)
        .lean();
      const target = { id: page.id as string, title: page.title, aliases: page.aliases };
      const books = await XenNotebook.find({ _id: { $in: rows.map((r) => r.notebook_id) } }, "name members").lean();
      const bookById = new Map(books.map((b) => [String(b._id), b]));
      res.json({
        status: true,
        data: {
          pages: rows.flatMap((r) => {
            const book = bookById.get(String(r.notebook_id));
            if (!book?.members.some((m) => m.user_id === uid)) return [];
            return [
              {
                id: String(r._id),
                title: r.title,
                notebook_id: String(r.notebook_id),
                notebook_name: book.name,
                in_notebook: true,
                snippet: findMention(r.search_text, target) ? mentionSnippet(r.search_text, target) : r.excerpt,
              },
            ];
          }),
        },
      });
    },
  );

  // Pages in the same notebook that name this page in plain text without linking to it yet.
  app.get(
    "/api/xennote/pages/:id/unlinked",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page } = await loadPage(req, req.params.id as string, "view");
      const names = [page.title, ...page.aliases].map((n) => n.trim()).filter((n) => n.length >= 2);
      if (names.length === 0) return res.json({ status: true, data: { pages: [] } });
      const target = { id: page.id as string, title: page.title, aliases: page.aliases };
      const visible = await visiblePagesFilter(uid);
      // A cheap pattern finds candidates; the exact whole-word test below decides.
      const candidates = await XenNotePage.find(
        {
          $and: [
            visible,
            { notebook_id: page.notebook_id, _id: { $ne: page._id }, links: { $ne: page._id } },
            { search_text: { $regex: names.map(escapeRegex).join("|"), $options: "i" } },
          ],
        },
        "title notebook_id search_text",
      )
        .sort({ updated_at: -1 })
        .limit(MAX_RELATED * 2)
        .lean();
      const book = await XenNotebook.findById(page.notebook_id, "members").lean();
      const out = candidates
        .filter((c) => !!findMention(c.search_text, target))
        .slice(0, MAX_RELATED)
        .map((c) => ({
          id: String(c._id),
          title: c.title,
          snippet: mentionSnippet(c.search_text, target),
          // Whether "Link it" will work for this person (it edits that page).
          can_edit: !!book && canEdit(book, uid),
        }));
      res.json({ status: true, data: { pages: out } });
    },
  );

  // "Link it": turn the first plain mention of the target page in this page's text into a link to it.
  app.post(
    "/api/xennote/pages/:id/link-mention",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteLinkMentionSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { target_id } = xenNoteLinkMentionSchema.parse(req.body);
      const { page, notebook } = await loadPage(req, req.params.id as string, "edit");
      const visible = await visiblePagesFilter(uid);
      const target = await XenNotePage.findOne({ $and: [visible, { _id: target_id }] }, "title aliases").lean();
      if (!target) throw new AppError(404, "Page not found");
      const body = await XenNotePageBody.findOne({ page_id: page._id }).lean();
      if (!body) throw new AppError(404, "Page not found");

      const { doc, changed } = linkFirstMention(body.doc as never, {
        id: String(target._id),
        title: target.title,
        aliases: target.aliases,
      });
      if (!changed) throw new AppError(409, "That page isn't mentioned here any more");
      const { rev } = await writePageBody(page, doc, uid, page.rev);
      // Anyone with this page open gets the new text (the editor that is typing keeps its own, and is warned).
      SocketManager.getInstance().notifyXenNotePageUpdate(notebookAudience(notebook), {
        pageId: page.id as string,
        notebookId: notebook.id as string,
        rev,
        by: uid,
      });
      res.json({ status: true, message: "Linked", data: { rev } });
    },
  );
}
