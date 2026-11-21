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
import { XenNotePage } from "../../models/xenNotePage";
import { User } from "../../models/user";
import { recordActivity } from "../../activity";
import { randomToken } from "../../utils/tokens";
import { notify } from "../../utils/notificationUtils";
import { canView } from "../../utils/membership";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../../utils/publicUser";
import { MAX_PAGE_PEOPLE } from "../../../shared/xennote/pages";
import { addRefused } from "../../social/policy";
import type { NotebookDoc } from "./shared";
import { canManagePage, loadPage, notifyTree, pageAudience, type PageDoc } from "./pageAccess";

// Sharing one page with chosen people who are not in its notebook. They see that page and its sub-pages (not the
// notebook around them), as editors or viewers. Anyone who can edit the notebook adds, changes and removes people;
// A direct member can also remove themselves.

const person = (u: { username?: string | null; avatar?: string | null } | undefined, id: string) => ({
  user_id: id,
  username: u?.username ?? "Unknown",
  avatar: u?.avatar ?? null,
  cosmetics: cosmeticsOf(u as never),
});

/** Who a page is open to, for the Share dialog. */
async function peopleOf(page: PageDoc, notebook: NotebookDoc, uid: string) {
  const users = await User.find({ _id: { $in: page.members.map((m) => m.user_id) } }, PUBLIC_USER_FIELDS).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const canManage = canManagePage(notebook.toObject(), uid);
  return {
    can_manage: canManage,
    token: canManage && page.share?.enabled ? (page.share.token ?? null) : null,
    members: page.members.map((m) => ({ ...person(byId.get(m.user_id), m.user_id), role: m.role })),
    // The notebook's own people can read the page too; shown (to them) so it is clear who else can.
    notebook: canView(notebook.toObject(), uid) ? { id: notebook.id as string, name: notebook.name } : null,
  };
}

export function registerPageSharingRoutes(app: any) {
  const share = (action: "enable" | "rotate" | "disable") => async (req: Request, res: Response) => {
    const { page, notebook, parent } = await loadPage(req, req.params.id as string, "manage");
    // Keep the existing token when enabling, even if another request just rotated it.
    const changes =
      action === "disable"
        ? { "share.enabled": false }
        : {
            "share.enabled": true,
            "share.token": action === "rotate" ? randomToken(16) : { $ifNull: ["$share.token", randomToken(16)] },
          };
    const updated = await XenNotePage.findOneAndUpdate({ _id: page._id }, [{ $set: changes }], { new: true });
    if (!updated) throw new AppError(404, "Page not found");
    notifyTree(notebook, pageAudience(notebook, updated, parent));
    res.json({ status: true, data: await peopleOf(updated, notebook, callerId(req)) });
  };
  app.post("/api/xennote/pages/:id/share", validateParams(xenNoteIdParamSchema), share("enable"));
  app.post("/api/xennote/pages/:id/share/rotate", validateParams(xenNoteIdParamSchema), share("rotate"));
  app.delete("/api/xennote/pages/:id/share", validateParams(xenNoteIdParamSchema), share("disable"));

  app.get(
    "/api/xennote/pages/:id/people",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { page, notebook } = await loadPage(req, req.params.id as string, "view");
      res.json({ status: true, data: await peopleOf(page, notebook, callerId(req)) });
    },
  );

  app.post(
    "/api/xennote/pages/:id/people",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteAddMembersSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page, notebook, parent } = await loadPage(req, req.params.id as string, "manage");
      const { userIds, role } = xenNoteAddMembersSchema.parse(req.body);
      if (addRefused(res, uid, userIds)) return;
      // People already in the notebook can read the page, so adding them here would change nothing.
      const existing = new Set([...notebook.members.map((m) => m.user_id), ...page.members.map((m) => m.user_id)]);
      const users = await User.find({ _id: { $in: userIds } }, "_id").lean();
      const added = users.map((u) => String(u._id)).filter((id) => !existing.has(id));
      if (page.members.length + added.length > MAX_PAGE_PEOPLE) {
        throw new AppError(400, `${MAX_PAGE_PEOPLE} people per page is the limit`);
      }
      const addedAt = new Date();
      for (const id of added) page.members.push({ user_id: id, role, added_at: addedAt, added_by: uid });
      await page.save();

      const me = (req.user as { username?: string }).username ?? "Someone";
      const what = page.title ? `"${page.title}"` : "a page";
      await Promise.all(
        added.map((id) =>
          notify(id, {
            app: "xennote",
            title: "Page shared with you",
            message: `${me} shared ${what} with you as ${role === "viewer" ? "a viewer" : "an editor"}.`,
            link: `/internal/xennote/p/${page.id}`,
            icon: "sticky_note_2",
          }),
        ),
      );
      if (added.length) {
        await recordActivity({
          actor: uid,
          verb: "xennote.page_shared",
          object: { type: "page", id: page.id, label: page.title },
          space: { app: "xennote", id: `page:${page.id}` },
          audience: { users: added },
        });
      }
      notifyTree(notebook, pageAudience(notebook, page, parent));
      res.json({
        status: true,
        message: added.length ? `Shared with ${added.length}` : "Already shared with them",
        data: await peopleOf(page, notebook, uid),
      });
    },
  );

  app.put(
    "/api/xennote/pages/:id/people/:userId",
    validateParams(xenNoteMemberParamSchema),
    validate(xenNoteShareRoleSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page, notebook, parent } = await loadPage(req, req.params.id as string, "manage");
      const member = page.members.find((m) => m.user_id === req.params.userId);
      if (!member) throw new AppError(404, "They don't have this page");
      member.role = xenNoteShareRoleSchema.parse(req.body).role;
      await page.save();
      notifyTree(notebook, pageAudience(notebook, page, parent));
      res.json({ status: true, message: "Saved", data: await peopleOf(page, notebook, uid) });
    },
  );

  // Notebook editors remove anyone; someone the page is shared with may remove only themselves (leave).
  app.delete(
    "/api/xennote/pages/:id/people/:userId",
    validateParams(xenNoteMemberParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const target = req.params.userId as string;
      const { page, notebook, parent } = await loadPage(req, req.params.id as string, "view");
      const manage = canManagePage(notebook.toObject(), uid);
      if (!manage && target !== uid) throw new AppError(403, "You can only remove yourself");
      const before = pageAudience(notebook, page, parent);
      if (!page.members.some((m) => m.user_id === target)) throw new AppError(404, "They don't have this page");
      page.set(
        "members",
        page.members.filter((m) => m.user_id !== target),
      );
      await page.save();
      notifyTree(notebook, before);
      const left = target === uid && !manage && !canView(notebook.toObject(), uid);
      res.json({
        status: true,
        message: left ? "You left the page" : "Removed",
        // Someone who just left can no longer read it, so there is nothing to show them.
        data: left ? null : await peopleOf(page, notebook, uid),
      });
    },
  );
}
