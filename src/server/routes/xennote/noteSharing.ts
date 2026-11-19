import type { Request, Response } from "express";
import {
  validate,
  validateParams,
  xenNoteAddMembersSchema,
  xenNoteIdParamSchema,
  xenNoteMemberParamSchema,
  xenNoteShareRoleSchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { User } from "../../models/user";
import { notify } from "../../utils/notificationUtils";
import { roleOf } from "../../utils/membership";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../../utils/publicUser";
import { MAX_NOTEBOOK_PEOPLE } from "../../../shared/xennote/notes";
import { addRefused } from "../../social/policy";
import { canManageNote, loadNote, notifyChange, type NoteDoc, type NotebookDoc } from "./shared";

// Sharing one note with chosen people (anyone with a link is notes.ts). The note's owner, or an editor of the notebook it
// is in, adds and removes people and changes their role; anyone it is shared with may leave.

const person = (u: { _id: unknown; username?: string | null; avatar?: string | null } | undefined, id: string) => ({
  user_id: id,
  username: u?.username ?? "Unknown",
  avatar: u?.avatar ?? null,
  cosmetics: cosmeticsOf(u as never),
});

/** Who a note is open to, for the Share dialog. */
async function sharingOf(note: NoteDoc, notebook: NotebookDoc | null, uid: string) {
  const manage = canManageNote(note.toObject(), notebook?.toObject() ?? null, uid);
  const ids = [note.owner_id, ...note.members.map((m) => m.user_id)];
  const users = await User.find({ _id: { $in: ids } }, PUBLIC_USER_FIELDS).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return {
    can_manage: manage,
    owner: person(byId.get(note.owner_id), note.owner_id),
    members: note.members.map((m) => ({ ...person(byId.get(m.user_id), m.user_id), role: m.role })),
    // A note in a notebook is also open to that notebook's people; shown so it is clear who else can read it.
    notebook: notebook && roleOf(notebook.toObject(), uid) ? { id: notebook.id as string, name: notebook.name } : null,
    share: manage ? { enabled: !!note.share?.enabled, token: note.share?.token ?? null } : null,
  };
}

export function registerNoteSharingRoutes(app: any) {
  app.get(
    "/api/xennote/notes/:id/sharing",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { note, notebook } = await loadNote(req, req.params.id as string, "view");
      res.json({ status: true, data: await sharingOf(note, notebook, callerId(req)) });
    },
  );

  app.post(
    "/api/xennote/notes/:id/members",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteAddMembersSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, notebook } = await loadNote(req, req.params.id as string, "manage");
      const { userIds, role } = req.body as { userIds: string[]; role: "editor" | "viewer" };
      if (addRefused(res, uid, userIds)) return;
      const existing = new Set([note.owner_id, ...note.members.map((m) => m.user_id)]);
      const users = await User.find({ _id: { $in: userIds } }, "_id").lean();
      const added = users.map((u) => String(u._id)).filter((id) => !existing.has(id));
      if (note.members.length + added.length > MAX_NOTEBOOK_PEOPLE) {
        throw new AppError(400, `${MAX_NOTEBOOK_PEOPLE} people per note is the limit`);
      }
      for (const id of added) note.members.push({ user_id: id, role, added_at: new Date() });
      await note.save();

      const me = (req.user as { username?: string }).username ?? "Someone";
      const what = note.title ? `"${note.title}"` : "a note";
      await Promise.all(
        added.map((id) =>
          notify(id, {
            app: "xennote",
            title: "A note was shared with you",
            message: `${me} shared ${what} with you as ${role === "viewer" ? "a viewer" : "an editor"}.`,
            link: `/internal/xennote?note=${note.id}`,
            icon: "sticky_note_2",
          }),
        ),
      );
      notifyChange(
        notebook,
        note.owner_id,
        note.members.map((m) => m.user_id),
      );
      res.json({
        status: true,
        message: added.length ? `Shared with ${added.length}` : "Already shared with them",
        data: await sharingOf(note, notebook, uid),
      });
    },
  );

  app.put(
    "/api/xennote/notes/:id/members/:userId",
    validateParams(xenNoteMemberParamSchema),
    validate(xenNoteShareRoleSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, notebook } = await loadNote(req, req.params.id as string, "manage");
      const member = note.members.find((m) => m.user_id === req.params.userId);
      if (!member) throw new AppError(404, "They don't have this note");
      member.role = req.body.role;
      await note.save();
      notifyChange(
        notebook,
        note.owner_id,
        note.members.map((m) => m.user_id),
      );
      res.json({ status: true, message: "Saved", data: await sharingOf(note, notebook, uid) });
    },
  );

  // The person who manages the note removes anyone; someone it is shared with may remove only themselves (leave).
  app.delete(
    "/api/xennote/notes/:id/members/:userId",
    validateParams(xenNoteMemberParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const target = req.params.userId as string;
      const { note, notebook } = await loadNote(req, req.params.id as string, "view");
      const manage = canManageNote(note.toObject(), notebook?.toObject() ?? null, uid);
      if (!manage && target !== uid) throw new AppError(403, "You can only remove yourself");
      const before = note.members.map((m) => m.user_id);
      if (!before.includes(target)) throw new AppError(404, "They don't have this note");
      note.set(
        "members",
        note.members.filter((m) => m.user_id !== target),
      );
      await note.save();
      notifyChange(notebook, note.owner_id, before);
      res.json({
        status: true,
        message: target === uid && !manage ? "You left the note" : "Removed",
        // Someone who just left can no longer read it, so there is nothing to show them.
        data: target === uid && !manage && !notebook ? null : await sharingOf(note, notebook, uid),
      });
    },
  );
}
