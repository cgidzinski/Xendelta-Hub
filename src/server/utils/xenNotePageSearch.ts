import { escapeRegex } from "@shared/regex";
import { XenNotebook } from "../models/xenNote";
import { XenNotePage, XenNoteSection } from "../models/xenNotePage";
import { normalizeTag } from "../../shared/xennote/pages";

// Finding pages for someone: the pages they can see, matched by name (title or alias) or by what they say. Everything
// that looks pages up for a person (link suggestions, "linked from", search, the hub search) goes through the same
// visibility filter, so a page someone can't open never shows up, not even as a title.

export interface PageHit {
  id: string;
  title: string;
  notebook_id: string;
  notebook_name: string | null;
  /** Whether the person is in the page's notebook (otherwise the page was shared with them alone). */
  in_notebook: boolean;
  section_id: string;
  section_name: string | null;
  color: string;
  icon: string | null;
  tags: string[];
  snippet: string;
  /** The alias that matched, when the page was found by one. */
  matched_alias: string | null;
  updated_at: string;
}

/** The pages `uid` can see: those in their notebooks, those shared with them, and the sub-pages of those. */
export async function visiblePagesFilter(uid: string): Promise<Record<string, unknown>> {
  const [books, shared] = await Promise.all([
    XenNotebook.find({ "members.user_id": uid }, "_id").lean(),
    XenNotePage.find({ "members.user_id": uid }, "_id").lean(),
  ]);
  return {
    $or: [
      { notebook_id: { $in: books.map((b) => b._id) } },
      { "members.user_id": uid },
      { parent_id: { $in: shared.map((p) => p._id) } },
    ],
  };
}

/** A short piece of `text` around the first of these words, for showing why a page matched. */
export function snippetAround(text: string, words: string[], width = 100): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const at = words
    .map((w) => lower.indexOf(w.toLowerCase()))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (at === undefined) return flat.slice(0, width);
  const start = Math.max(0, at - 30);
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + width)}${start + width < flat.length ? "…" : ""}`;
}

interface PageRow {
  _id: unknown;
  title: string;
  notebook_id: unknown;
  section_id: unknown;
  color: string;
  icon?: string | null;
  tags: string[];
  excerpt: string;
  aliases: string[];
  search_text?: string;
  updated_at: Date;
}

const FIELDS = "title notebook_id section_id color icon tags excerpt aliases updated_at";

/** Names for the notebooks and sections these pages are in, and which notebooks the person belongs to. */
async function decorate(uid: string, rows: PageRow[], how: Map<string, { alias: string | null; snippet: string }>) {
  const [books, sections] = await Promise.all([
    XenNotebook.find({ _id: { $in: rows.map((r) => r.notebook_id) } }, "name members").lean(),
    XenNoteSection.find({ _id: { $in: rows.map((r) => r.section_id) } }, "name").lean(),
  ]);
  const bookById = new Map(books.map((b) => [String(b._id), b]));
  const sectionById = new Map(sections.map((s) => [String(s._id), s.name]));
  return rows.map((r): PageHit => {
    const book = bookById.get(String(r.notebook_id));
    const inNotebook = !!book?.members.some((m) => m.user_id === uid);
    const id = String(r._id);
    return {
      id,
      title: r.title,
      notebook_id: String(r.notebook_id),
      // The notebook's name is only for people who are in it.
      notebook_name: inNotebook ? (book?.name ?? null) : null,
      in_notebook: inNotebook,
      section_id: String(r.section_id),
      section_name: inNotebook ? (sectionById.get(String(r.section_id)) ?? null) : null,
      color: r.color,
      icon: r.icon ?? null,
      tags: r.tags,
      snippet: how.get(id)?.snippet ?? r.excerpt,
      matched_alias: how.get(id)?.alias ?? null,
      updated_at: r.updated_at.toISOString(),
    };
  });
}

interface SearchOptions {
  q?: string;
  notebook?: string;
  tag?: string;
  limit?: number;
  /** Match titles and aliases only (link suggestions), not what a page says. */
  namesOnly?: boolean;
  /** With nothing typed, give the most recently changed pages instead of nothing. */
  recent?: boolean;
}

/**
 * Pages whose title or alias contains the text (starting with it first), then pages whose text matches. A tag narrows to
 * pages with it. Only pages the person can see.
 */
export async function searchPages(uid: string, options: SearchOptions): Promise<PageHit[]> {
  const q = (options.q ?? "").trim();
  const tag = options.tag ? normalizeTag(options.tag) : "";
  const limit = options.limit ?? 30;
  if (!q && !tag && !options.recent) return [];

  const scope: Record<string, unknown>[] = [await visiblePagesFilter(uid)];
  if (options.notebook) scope.push({ notebook_id: options.notebook });
  if (tag) scope.push({ tags: tag });

  const how = new Map<string, { alias: string | null; snippet: string }>();
  const ordered: PageRow[] = [];
  const seen = new Set<string>();
  const add = (row: PageRow) => {
    const id = String(row._id);
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(row);
    }
  };

  if (!q) {
    for (const row of await XenNotePage.find({ $and: scope }, FIELDS)
      .sort({ updated_at: -1 })
      .limit(limit)
      .lean<PageRow[]>())
      add(row);
  } else {
    const rx = new RegExp(escapeRegex(q), "i");
    const byName = await XenNotePage.find({ $and: [...scope, { $or: [{ title: rx }, { aliases: rx }] }] }, FIELDS)
      .limit(limit * 2)
      .lean<PageRow[]>();
    const starts = (r: PageRow) => (r.title.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1);
    byName.sort((a, b) => starts(a) - starts(b) || b.updated_at.getTime() - a.updated_at.getTime());
    for (const row of byName) {
      if (!rx.test(row.title))
        how.set(String(row._id), { alias: row.aliases.find((a) => rx.test(a)) ?? null, snippet: row.excerpt });
      add(row);
    }
    if (q.length >= 2 && !options.namesOnly) {
      const byText = await XenNotePage.find(
        { $and: [...scope, { $text: { $search: q } }] },
        { score: { $meta: "textScore" }, search_text: 1, ...Object.fromEntries(FIELDS.split(" ").map((f) => [f, 1])) },
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean<PageRow[]>();
      const words = q.split(/\s+/).filter(Boolean);
      for (const row of byText) {
        if (!seen.has(String(row._id)))
          how.set(String(row._id), { alias: null, snippet: snippetAround(row.search_text ?? "", words) });
        add(row);
      }
    }
  }
  return decorate(uid, ordered.slice(0, limit), how);
}
