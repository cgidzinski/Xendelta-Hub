// One way to ask "who is in this, and what may they do?" for every sub-app.
//
// A shared thing (a recipe book, a routine, a budget book, a split group) holds
// `members: [{ user_id, role }]`. There is exactly one owner; owners and editors change things;
// viewers only read. New sub-apps should store membership this way (use `memberFields` in the
// schema) and call these helpers instead of writing their own checks.

import { Schema } from "mongoose";

export type MemberRole = "owner" | "editor" | "viewer";
export const MEMBER_ROLES: readonly MemberRole[] = ["owner", "editor", "viewer"];

export interface MemberLike {
  user_id: string;
  role: MemberRole;
}
export interface HasMembers<M extends MemberLike = MemberLike> {
  members: M[];
}

/** Schema fields for a member entry; spread into the app's own member schema to add extras. */
export const memberFields = {
  user_id: { type: String, required: true },
  role: { type: String, enum: MEMBER_ROLES, default: "editor" },
  added_at: { type: Date, default: Date.now },
} as const;

/** A plain member schema (no app-specific extras). */
export const memberSchema = new Schema(memberFields, { _id: false });

type Maybe<T> = T | null | undefined;

export function roleOf(doc: Maybe<HasMembers>, userId: string): MemberRole | null {
  return doc?.members.find((m) => m.user_id === userId)?.role ?? null;
}
/** Any member can read. */
export const canView = (doc: Maybe<HasMembers>, userId: string) => roleOf(doc, userId) !== null;
/** Owners and editors change what is inside. */
export const canEdit = (doc: Maybe<HasMembers>, userId: string) => {
  const r = roleOf(doc, userId);
  return r === "owner" || r === "editor";
};
/** Only the owner manages people and sharing, and renames or deletes. */
export const canManage = (doc: Maybe<HasMembers>, userId: string) => roleOf(doc, userId) === "owner";

export type MemberChange<M extends MemberLike = MemberLike> =
  { ok: true; members: M[] } | { ok: false; code: 403 | 404 | 400; message: string };

/**
 * Applies a role change. Making someone else the owner hands the thing over: the old owner
 * becomes an editor, so there is always exactly one owner.
 */
export function changeRole<M extends MemberLike>(
  doc: HasMembers<M>,
  actor: string,
  target: string,
  role: MemberRole,
): MemberChange<M> {
  if (!canManage(doc, actor)) return { ok: false, code: 403, message: "Only the owner can change roles" };
  const member = doc.members.find((m) => m.user_id === target);
  if (!member) return { ok: false, code: 404, message: "Not a member" };
  if (target === actor && role !== "owner") {
    return { ok: false, code: 400, message: "Hand it to someone else first" };
  }
  const members = doc.members.map((m) => {
    if (m.user_id === target) return { ...m, role };
    if (role === "owner" && m.role === "owner") return { ...m, role: "editor" as MemberRole };
    return { ...m };
  });
  return { ok: true, members };
}

/** The owner removes anyone else; anyone else may remove only themselves. The owner can't leave. */
export function removeMember<M extends MemberLike>(doc: HasMembers<M>, actor: string, target: string): MemberChange<M> {
  const role = roleOf(doc, target);
  if (!role || !canView(doc, actor)) return { ok: false, code: 404, message: "Not a member" };
  if (role === "owner")
    return { ok: false, code: 400, message: "The owner can't leave — hand it to someone else first" };
  if (actor !== target && !canManage(doc, actor))
    return { ok: false, code: 403, message: "Only the owner can remove people" };
  return { ok: true, members: doc.members.filter((m) => m.user_id !== target) };
}

// ---------------------------------------------------------------------------------------------
// Apps that still store `members: ObjectId[]` + `created_by` (XenBudget, XenSplit)
//
// Those two predate roles: the creator is the owner and everyone else is an editor. During the
// move to the standard shape they also keep a `roster: [{ user_id, role }]` that is derived from
// those two fields on every save (see `rosterSync`) and backfilled by a migration. The helpers
// below always derive from the original fields, so a permission check is right even for a
// document nobody has saved since the roster was added.
// ---------------------------------------------------------------------------------------------

type IdLike = string | { _id?: unknown; toString(): string };
interface LegacyMembership {
  created_by?: string | null;
  members?: ArrayLike<IdLike> | null;
}

const idString = (m: IdLike): string =>
  typeof m === "string" ? m : m && (m as { _id?: unknown })._id ? String((m as { _id: unknown })._id) : String(m);

/** The roster implied by `members` + `created_by`: the creator is the owner, everyone else an editor. */
export function legacyRoster(doc: Maybe<LegacyMembership>): MemberLike[] {
  const ids = Array.from(doc?.members ?? [], idString);
  return [...new Set(ids)].map((user_id) => ({ user_id, role: user_id === doc?.created_by ? "owner" : "editor" }));
}

/** A document in the legacy shape, viewed through the standard helpers: `canManage(accessOf(book), uid)`. */
export const accessOf = (doc: Maybe<LegacyMembership>): HasMembers => ({ members: legacyRoster(doc) });

/**
 * Keeps `roster` in step with `members` + `created_by` whenever the document is saved. Existing
 * `added_at` values are kept so a save does not rewrite when someone joined.
 */
export function rosterSync(schema: Schema): void {
  schema.pre("validate", function () {
    const previous = new Map<string, unknown>(
      Array.from((this.get("roster") ?? []) as Array<{ user_id: string; added_at?: Date }>, (r) => [
        r.user_id,
        r.added_at,
      ]),
    );
    this.set(
      "roster",
      legacyRoster(this as unknown as LegacyMembership).map((r) => ({
        ...r,
        added_at: previous.get(r.user_id) ?? new Date(),
      })),
    );
  });
}
