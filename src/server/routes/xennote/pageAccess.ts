import type { Request } from "express";
import type { HydratedDocument } from "mongoose";
import { AppError, callerId } from "../../utils/http";
import { XenNotebook } from "../../models/xenNote";
import { XenNotePage, XenNoteSection, type XenNotePageAttrs, type XenNoteSectionAttrs } from "../../models/xenNotePage";
import { SocketManager } from "../../infrastructure/SocketManager";
import { canEdit, canView, type MemberRole } from "../../utils/membership";
import { canManagePage, pageRole } from "../../utils/xenNotePages";
import type { PageTreeEntry } from "../../../shared/xennote/pages";
import type { NotebookDoc } from "./shared";

// Who may do what with sections and pages. Sections follow their notebook alone. A page follows its notebook too, and
// can also be shared with chosen people who are not in the notebook (`page.members`); someone added to a page also
// sees its sub-pages. A person's role on a page is the best of those. Only notebook editors move, delete or share a
// page. Someone who can't see a section or page gets a 404, so ids can't be probed.

export type SectionDoc = HydratedDocument<XenNoteSectionAttrs>;
export type PageDoc = HydratedDocument<XenNotePageAttrs>;

export { pageRole, canManagePage };

interface LoadOptions {
  /** Also find what is in the trash (the Trash view, restoring, deleting for good). */
  includeDeleted?: boolean;
}

/** A section, and its notebook, checked for the access `need`. Only notebook members have access to sections. */
export async function loadSection(
  req: Request,
  id: string,
  need: "view" | "edit",
  options: LoadOptions = {},
): Promise<{ section: SectionDoc; notebook: NotebookDoc }> {
  const uid = callerId(req);
  const section = await XenNoteSection.findById(id).setOptions({ includeDeleted: !!options.includeDeleted });
  const notebook = section ? await XenNotebook.findById(section.notebook_id) : null;
  if (!section || !notebook || !canView(notebook.toObject(), uid)) throw new AppError(404, "Section not found");
  if (need === "edit" && !canEdit(notebook.toObject(), uid)) throw new AppError(403, "You can only view this notebook");
  return { section, notebook };
}

/** A page, its notebook and its parent page (if a sub-page), checked for the access `need`. */
export async function loadPage(
  req: Request,
  id: string,
  need: "view" | "edit" | "manage",
  options: LoadOptions = {},
): Promise<{ page: PageDoc; notebook: NotebookDoc; parent: PageDoc | null; role: MemberRole }> {
  const uid = callerId(req);
  const include = { includeDeleted: !!options.includeDeleted };
  const page = await XenNotePage.findById(id).setOptions(include);
  if (!page) throw new AppError(404, "Page not found");
  const [notebook, parent] = await Promise.all([
    XenNotebook.findById(page.notebook_id),
    page.parent_id ? XenNotePage.findById(page.parent_id).setOptions(include) : null,
  ]);
  if (!notebook) throw new AppError(404, "Page not found");
  const role = pageRole(page.toObject(), notebook.toObject(), parent?.toObject() ?? null, uid);
  if (!role) throw new AppError(404, "Page not found");
  if (need === "edit" && role === "viewer") throw new AppError(403, "You can only view this page");
  if (need === "manage" && !canManagePage(notebook.toObject(), uid)) {
    throw new AppError(403, "Only people who can edit the notebook can do that");
  }
  return { page, notebook, parent, role };
}

/** Everyone who can see a page: the notebook's people, and anyone added to the page or to its parent. */
export function pageAudience(notebook: NotebookDoc, page: PageDoc, parent: PageDoc | null = null): string[] {
  return [
    ...new Set([
      ...notebook.members.map((m) => m.user_id),
      ...page.members.map((m) => m.user_id),
      ...(parent?.members.map((m) => m.user_id) ?? []),
    ]),
  ];
}

/** Tell the people who can see a notebook that its sections or pages changed. */
export function notifyTree(notebook: NotebookDoc, extra: string[] = []) {
  const ids = [...new Set([...notebook.members.map((m) => m.user_id), ...extra])];
  SocketManager.getInstance().notifyXenNoteNotebookUpdate(ids, notebook.id as string);
}

export const serializeSection = (s: SectionDoc) => ({
  id: s.id as string,
  notebook_id: String(s.notebook_id),
  name: s.name,
  color: s.color,
  kind: s.kind,
  order: s.order,
  created_at: s.created_at,
  updated_at: s.updated_at,
});

/** A page as the tree lists it: no body, so a whole notebook is one small response. */
export const treeEntry = (page: PageDoc, uid: string): PageTreeEntry => ({
  id: page.id as string,
  section_id: String(page.section_id),
  parent_id: page.parent_id ? String(page.parent_id) : null,
  order: page.order,
  title: page.title,
  icon: page.icon ?? null,
  color: page.color,
  archived: page.archived,
  favorite: page.favorited_by.includes(uid),
  tags: page.tags,
  excerpt: page.excerpt,
  journal_date: page.journal_date ?? null,
  todo: { open: page.todo?.open ?? 0, done: page.todo?.done ?? 0 },
  updated_at: (page.updated_at as Date).toISOString(),
});

/** A page's own details (everything but its body), for the person asking. */
export const serializePage = (page: PageDoc, uid: string, role: MemberRole, canManage: boolean) => ({
  ...treeEntry(page, uid),
  notebook_id: String(page.notebook_id),
  aliases: page.aliases,
  tags_manual: page.tags_manual,
  rev: page.rev,
  word_count: page.word_count,
  my_role: role,
  can_edit: role !== "viewer",
  can_manage: canManage,
  created_at: page.created_at,
  updated_by: page.updated_by ?? null,
});
