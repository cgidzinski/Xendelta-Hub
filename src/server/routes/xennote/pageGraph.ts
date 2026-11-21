import type { Request, Response } from "express";
import { XenNotebook } from "../../models/xenNote";
import { XenNotePage } from "../../models/xenNotePage";
import { callerId } from "../../utils/http";
import { validateQuery, xenNoteGraphQuerySchema } from "../../utils/validation";
import { visiblePagesFilter } from "../../utils/xenNotePageSearch";
import { loadNotebook } from "./shared";
import type { GraphNode, GraphEdge, NotebookGraph } from "../../../shared/xennote/graph";

const MAX_PAGES = 1000;
const MAX_LINKS = 6000;

export function registerPageGraphRoutes(app: any) {
  app.get("/api/xennote/graph", validateQuery(xenNoteGraphQuerySchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { notebook, mergeTags } = xenNoteGraphQuerySchema.parse(req.query);
    const book = notebook ? await loadNotebook(req, notebook, "view") : null;
    const rows = await XenNotePage.find(
      {
        ...(book ? { notebook_id: book._id } : await visiblePagesFilter(uid)),
        archived: { $ne: true },
      },
      "title notebook_id tags links",
    )
      .sort({ updated_at: -1, _id: 1 })
      .limit(MAX_PAGES + 1)
      .lean();
    const truncatedPages = rows.length > MAX_PAGES;
    if (truncatedPages) rows.pop();

    const books = await XenNotebook.find(
      {
        _id: { $in: rows.map((row) => row.notebook_id) },
        "members.user_id": uid,
      },
      "name",
    ).lean();
    const names = new Map(books.map((b) => [String(b._id), b.name]));
    const visibleRows = rows.filter((row) => names.has(String(row.notebook_id)));
    const nodes: GraphNode[] = visibleRows.map((row) => {
      const notebookId = String(row.notebook_id);
      return {
        id: String(row._id),
        kind: "page",
        label: row.title || "Untitled page",
        notebook_id: notebookId,
        notebook_name: names.get(notebookId) ?? null,
      };
    });
    const included = new Set(nodes.map((node) => node.id));
    const tags = new Set<string>();
    const links: GraphEdge[] = [];
    let truncated = truncatedPages;
    for (const row of visibleRows) {
      const source = String(row._id);
      const notebookId = String(row.notebook_id);
      for (const link of row.links) {
        const target = String(link);
        if (!included.has(target) || target === source) continue;
        if (links.length >= MAX_LINKS) {
          truncated = true;
          break;
        }
        links.push({ source, target, kind: "link" });
      }
      for (const tag of row.tags) {
        if (links.length >= MAX_LINKS) {
          truncated = true;
          break;
        }
        const merged = !book && mergeTags === "true";
        const target = merged ? `tag:${tag}` : `tag:${notebookId}:${tag}`;
        if (!tags.has(target)) {
          tags.add(target);
          nodes.push({
            id: target,
            label: `#${tag}`,
            kind: "tag",
            tag,
            notebook_id: merged ? null : notebookId,
            notebook_name: merged ? null : (names.get(notebookId) ?? null),
          });
        }
        links.push({ source, target, kind: "tag" });
      }
    }
    const data: NotebookGraph = { nodes, links, notebook_name: book?.name ?? null, truncated };
    res.json({ status: true, data });
  });
}
