import { Types } from "mongoose";
import { escapeRegex } from "@shared/regex";
import { User } from "../models/user";
import { XenNote } from "../models/xenNote";
import { XenDriveFile } from "../models/xendriveFile";
import { XenDriveFolder } from "../models/xendriveFolder";
import { XenLink } from "../models/xenlink";
import { XenKitchenBook, XenKitchenItem } from "../models/xenKitchen";
import { XenRoutine } from "../models/xenRoutine";
import { XenSplit } from "../models/xenSplit";
import { XenBudgetBook, XenBudgetItem } from "../models/xenBudget";
import { PUBLIC_USER_FIELDS } from "../utils/publicUser";
import { searchPages } from "../utils/xenNotePageSearch";

// Global search (the Ctrl+K palette): one query across what a person can reach in every app. Each source answers for
// itself, only ever with things the caller can open, and a few at a time; one that fails is logged and left out so the
// rest still answer. Messages are not searched here (chat has its own search, which knows about channels and access).

export const SEARCH_MIN = 2;
export const SEARCH_PER_SOURCE = 5;

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  /** Where it opens, inside the app. */
  link: string;
}
export interface SearchGroup {
  kind: string;
  label: string;
  hits: SearchHit[];
}

const clip = (text: string, n = 90) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};
/** A short piece of `text` around where `needle` appears, so a hit in the body shows why it matched. */
const around = (text: string, needle: string) => {
  const flat = text.replace(/\s+/g, " ");
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return clip(flat);
  const start = Math.max(0, at - 30);
  return `${start > 0 ? "…" : ""}${clip(flat.slice(start), 90)}`;
};

type Source = (uid: string, q: string, rx: RegExp) => Promise<SearchGroup | null>;

const people: Source = async (uid, q) => {
  const found = await User.find(
    { username: { $regex: `^${escapeRegex(q)}`, $options: "i" }, _id: { $ne: uid } },
    PUBLIC_USER_FIELDS,
  )
    .sort({ username: 1 })
    .limit(SEARCH_PER_SOURCE)
    .lean();
  return {
    kind: "people",
    label: "People",
    hits: found.map((u) => ({ id: String(u._id), title: u.username as string, link: `/internal/people/${u._id}` })),
  };
};

const notes: Source = async (uid, q, rx) => {
  const found = await XenNote.find({
    archived: { $ne: true },
    $and: [
      { $or: [{ owner_id: uid }, { "members.user_id": uid }] },
      {
        $or: [
          { title: rx },
          { body: rx },
          { "checklist.text": rx },
          { "link.title": rx },
          { "link.url": rx },
          { labels: rx },
        ],
      },
    ],
  })
    .sort({ updated_at: -1 })
    .limit(SEARCH_PER_SOURCE)
    .lean();
  return {
    kind: "notes",
    label: "Notes",
    hits: found.map((n) => {
      const inBody = n.body && rx.test(n.body) ? around(n.body, q) : "";
      return {
        id: String(n._id),
        title: n.title || clip(n.body || n.checklist[0]?.text || n.link?.title || "Untitled note", 60),
        subtitle: inBody || undefined,
        link: `/internal/xennote?note=${n._id}`,
      };
    }),
  };
};

// Notebook pages: by name, then by what they say. Only pages the person can see (utils/xenNotePageSearch.ts).
const pages: Source = async (uid, q) => {
  const found = await searchPages(uid, { q, limit: SEARCH_PER_SOURCE });
  return {
    kind: "pages",
    label: "Pages",
    hits: found.map((p) => ({
      id: p.id,
      title: p.title.trim() || "Untitled page",
      subtitle: [clip(p.snippet, 70), p.notebook_name].filter(Boolean).join(" · ") || undefined,
      // Someone who was added to the page alone opens it by itself, without the notebook around it.
      link: p.in_notebook ? `/internal/xennote/b/${p.notebook_id}/p/${p.id}` : `/internal/xennote/p/${p.id}`,
    })),
  };
};

const files: Source = async (uid, _q, rx) => {
  const [fileDocs, folderDocs] = await Promise.all([
    XenDriveFile.find({ owner_id: uid, name: rx }, "name").sort({ createdAt: -1 }).limit(SEARCH_PER_SOURCE).lean(),
    XenDriveFolder.find({ owner_id: uid, name: rx }, "name").sort({ name: 1 }).limit(3).lean(),
  ]);
  return {
    kind: "files",
    label: "Files",
    hits: [
      ...folderDocs.map((f) => ({
        id: String(f._id),
        title: f.name,
        subtitle: "Folder",
        link: `/internal/xendrive/folder/${f._id}`,
      })),
      ...fileDocs.map((f) => ({ id: String(f._id), title: f.name, link: `/internal/xendrive/file/${f._id}` })),
    ].slice(0, SEARCH_PER_SOURCE),
  };
};

const links: Source = async (uid, _q, rx) => {
  const found = await XenLink.find({ owner_id: uid, $or: [{ name: rx }, { url: rx }, { slug: rx }] }, "name url slug")
    .sort({ _id: -1 })
    .limit(SEARCH_PER_SOURCE)
    .lean();
  return {
    kind: "links",
    label: "Short links",
    hits: found.map((l) => ({
      id: String(l._id),
      title: l.name,
      subtitle: clip(l.url, 70),
      link: "/internal/xenlink",
    })),
  };
};

const recipes: Source = async (uid, _q, rx) => {
  const books = await XenKitchenBook.find({ "members.user_id": uid }, "_id name").lean();
  if (books.length === 0) return null;
  const names = new Map(books.map((b) => [String(b._id), b.name]));
  const found = await XenKitchenItem.find({ book_id: { $in: books.map((b) => b._id) }, title: rx }, "title book_id")
    .sort({ updated_at: -1 })
    .limit(SEARCH_PER_SOURCE)
    .lean();
  return {
    kind: "recipes",
    label: "Recipes",
    hits: found.map((r) => ({
      id: String(r._id),
      title: r.title || "Untitled",
      subtitle: names.get(String(r.book_id)),
      link: `/internal/xenkitchen/${r._id}`,
    })),
  };
};

const routines: Source = async (uid, _q, rx) => {
  const found = await XenRoutine.find(
    { "members.user_id": uid, $or: [{ name: rx }, { category: rx }, { notes: rx }] },
    "name category",
  )
    .sort({ name: 1 })
    .limit(SEARCH_PER_SOURCE)
    .lean();
  return {
    kind: "routines",
    label: "Routines",
    hits: found.map((r) => ({
      id: String(r._id),
      title: r.name,
      subtitle: r.category || undefined,
      link: "/internal/xenroutine/routines",
    })),
  };
};

const splits: Source = async (uid, _q, rx) => {
  const me = new Types.ObjectId(uid);
  const [groups, expenses] = await Promise.all([
    XenSplit.find({ members: me, name: rx }, "name").sort({ created_at: -1 }).limit(3).lean(),
    // Expenses live inside their group, so look through the caller's groups; deleted ones are left out.
    XenSplit.aggregate<{
      _id: Types.ObjectId;
      name: string;
      expense: { _id: Types.ObjectId; title: string; amount: number; currency: string };
    }>([
      { $match: { members: me } },
      { $unwind: "$expenses" },
      { $match: { "expenses.title": rx, "expenses.deleted_at": null } },
      { $sort: { "expenses.date": -1 } },
      { $limit: SEARCH_PER_SOURCE },
      {
        $project: {
          name: 1,
          expense: {
            _id: "$expenses._id",
            title: "$expenses.title",
            amount: "$expenses.amount",
            currency: "$expenses.currency",
          },
        },
      },
    ]),
  ]);
  return {
    kind: "expenses",
    label: "XenSplit",
    hits: [
      ...groups.map((g) => ({
        id: String(g._id),
        title: g.name,
        subtitle: "Group",
        link: `/internal/xensplit/groups/${g._id}/overview`,
      })),
      ...expenses.map((e) => ({
        id: String(e.expense._id),
        title: e.expense.title,
        subtitle: `${e.expense.amount} ${e.expense.currency} · ${e.name}`,
        link: `/internal/xensplit/groups/${e._id}/expenses`,
      })),
    ].slice(0, SEARCH_PER_SOURCE),
  };
};

const budgets: Source = async (uid, _q, rx) => {
  const me = new Types.ObjectId(uid);
  const books = await XenBudgetBook.find({ members: me }, "name").lean();
  if (books.length === 0) return null;
  const names = new Map(books.map((b) => [String(b._id), b.name]));
  const [matchingBooks, items] = await Promise.all([
    Promise.resolve(books.filter((b) => rx.test(b.name)).slice(0, 3)),
    XenBudgetItem.find(
      { book_id: { $in: books.map((b) => b._id) }, description: rx },
      "description amount currency book_id",
    )
      .sort({ date: -1 })
      .limit(SEARCH_PER_SOURCE)
      .lean(),
  ]);
  return {
    kind: "budget",
    label: "XenBudget",
    hits: [
      ...matchingBooks.map((b) => ({
        id: String(b._id),
        title: b.name,
        subtitle: "Book",
        link: `/internal/xenbudget/books/${b._id}/overview`,
      })),
      ...items.map((i) => ({
        id: String(i._id),
        title: i.description,
        subtitle: `${i.amount} ${i.currency ?? ""} · ${names.get(String(i.book_id)) ?? ""}`.trim(),
        link: `/internal/xenbudget/books/${i.book_id}/items`,
      })),
    ].slice(0, SEARCH_PER_SOURCE),
  };
};

const SOURCES: Source[] = [notes, pages, files, recipes, splits, budgets, routines, links, people];

/** Search every source for `query` (at least SEARCH_MIN characters) on behalf of `uid`. Empty groups are left out. */
export async function searchEverything(uid: string, query: string): Promise<SearchGroup[]> {
  const q = query.trim();
  if (q.length < SEARCH_MIN) return [];
  // The text is escaped: it is only ever a literal, never a pattern.
  const rx = new RegExp(escapeRegex(q), "i");
  const results = await Promise.all(
    SOURCES.map((source) =>
      source(uid, q, rx).catch((e) => {
        console.error("Search source failed:", e);
        return null;
      }),
    ),
  );
  return results.filter((g): g is SearchGroup => !!g && g.hits.length > 0);
}
