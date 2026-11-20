import type { Request, Response } from "express";
import { Types } from "mongoose";
import {
  validate,
  validateParams,
  validateQuery,
  xenNoteBulkDeleteSchema,
  xenNoteBulkUpdateSchema,
  xenNoteCreateSchema,
  xenNoteIdParamSchema,
  xenNoteListQuerySchema,
  xenNoteReminderSchema,
  xenNoteUpdateSchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNote } from "../../models/xenNote";
import { randomToken } from "../../utils/tokens";
import { contentChanged, contentOf, keepVersion } from "../../utils/xenNoteVersions";
import { MAX_CHECKLIST_ITEMS, normalizeLabels } from "../../../shared/xennote/notes";
import { linkFirstMention, mentionSnippet } from "../../../shared/xennote/linkMention";
import { markdownToDoc } from "../../../shared/xennote/convert/v1";
import { linksTo } from "../../../shared/xennote/wikiLinks";
import {
  escapeRegex,
  loadNote,
  namesForNotes,
  noteRole,
  noteUsers,
  notifyChange,
  notifyNoteUsers,
  serializeNote,
  visibleNotesFilter,
  type NoteDoc,
} from "./shared";

/**
 * Apply a create/update body to a note, then make the note consistent with its type: a checklist
 * only keeps checklist items, a link only keeps its link, and a link must have an address.
 */
function applyFields(note: NoteDoc, body: Record<string, any>) {
  for (const key of ["type", "title", "body", "color", "pinned", "archived"] as const) {
    if (body[key] !== undefined) (note as any)[key] = body[key];
  }
  if (body.labels !== undefined) note.labels = normalizeLabels(body.labels);
  if (body.link !== undefined)
    note.link = { url: body.link.url, title: body.link.title, description: body.link.description };
  if (body.checklist !== undefined) {
    const items = (body.checklist as Array<{ _id?: string; text: string; done: boolean }>)
      .filter((i) => i.text.trim() !== "")
      .slice(0, MAX_CHECKLIST_ITEMS)
      .map((i) => ({
        ...(i._id && Types.ObjectId.isValid(i._id) ? { _id: i._id } : {}),
        text: i.text.trim(),
        done: !!i.done,
      }));
    note.set("checklist", items);
  }

  if (note.type !== "checklist") note.set("checklist", []);
  if (note.type !== "link") note.link = { url: "", title: "", description: "" };
  else if (!note.link?.url) throw new AppError(400, "Add a web address for the link");
}

export function registerNoteRoutes(app: any) {
  async function editableAmong(uid: string, ids: string[]) {
    const notes = await XenNote.find({ _id: { $in: ids }, ...visibleNotesFilter(uid) });
    return notes.filter((note) => {
      const role = noteRole(note, uid);
      return role === "owner" || role === "editor";
    });
  }

  // Change several notes at once. Notes the caller can't edit are skipped, and the count says how many were changed.
  app.post("/api/xennote/notes/bulk-update", validate(xenNoteBulkUpdateSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const body = xenNoteBulkUpdateSchema.parse(req.body);
    const targets = await editableAmong(uid, body.ids);
    for (const note of targets) {
      if (body.archived !== undefined) note.archived = body.archived;
      if (body.color !== undefined) note.color = body.color;
      if (body.add_label !== undefined) note.labels = normalizeLabels([...note.labels, body.add_label]);
      if (body.remove_label !== undefined) {
        const gone = body.remove_label.toLowerCase();
        note.labels = note.labels.filter((l) => l.toLowerCase() !== gone);
      }
      note.updated_by = uid;
      await note.save();
    }
    if (targets.length) notifyNoteUsers(targets.flatMap(noteUsers));
    res.json({
      status: true,
      message: "Notes updated",
      data: { updated: targets.length, skipped: body.ids.length - targets.length },
    });
  });

  // Send several notes to the Trash. Notes the caller doesn't manage (shared with them, say) are skipped.
  app.post("/api/xennote/notes/bulk-delete", validate(xenNoteBulkDeleteSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { ids } = xenNoteBulkDeleteSchema.parse(req.body);
    const targets = await XenNote.find({ _id: { $in: ids }, owner_id: uid });
    const now = new Date();
    for (const note of targets) {
      note.deleted_at = now;
      note.deleted_by = uid;
      await note.save();
    }
    if (targets.length) notifyNoteUsers(targets.flatMap(noteUsers));
    res.json({
      status: true,
      message: "Notes moved to Trash",
      data: { deleted: targets.length, skipped: ids.length - targets.length },
    });
  });

  app.get("/api/xennote/notes", validateQuery(xenNoteListQuerySchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { scope, archived, label, q } = req.query as Record<string, string | undefined>;
    const access =
      scope === "mine" ? { owner_id: uid } : scope === "shared" ? { "members.user_id": uid } : visibleNotesFilter(uid);
    const and: Record<string, unknown>[] = [access, { archived: archived === "true" ? true : { $ne: true } }];
    if (label) and.push({ labels: { $regex: `^${escapeRegex(label)}$`, $options: "i" } });
    if (q && q.trim()) {
      const rx = { $regex: escapeRegex(q.trim()), $options: "i" };
      and.push({
        $or: [
          { title: rx },
          { body: rx },
          { "checklist.text": rx },
          { "link.title": rx },
          { "link.description": rx },
          { "link.url": rx },
          { labels: rx },
        ],
      });
    }

    const notes = await XenNote.find({ $and: and }).sort({ pinned: -1, updated_at: -1 }).limit(500);
    const names = await namesForNotes(notes);
    const data = await Promise.all(
      notes.map((n) =>
        serializeNote(n, {
          uid,
          role: noteRole(n, uid),
          names,
        }),
      ),
    );
    res.json({ status: true, message: "Notes retrieved", data: { notes: data } });
  });

  // How many notes each part of the rail holds: everything, my private ones, and the archive.
  app.get("/api/xennote/counts", async (req: Request, res: Response) => {
    const uid = callerId(req);
    const visible = visibleNotesFilter(uid);
    const [all, mine, archived, trash, shared] = await Promise.all([
      XenNote.countDocuments({ ...visible, archived: { $ne: true } }),
      XenNote.countDocuments({ owner_id: uid, archived: { $ne: true } }),
      XenNote.countDocuments({ ...visible, archived: true }),
      XenNote.countDocuments({ deleted_by: uid, deleted_at: { $ne: null } }).setOptions({ includeDeleted: true }),
      XenNote.countDocuments({ "members.user_id": uid, archived: { $ne: true } }),
    ]);
    res.json({ status: true, message: "Counts retrieved", data: { all, mine, archived, trash, shared } });
  });

  app.get("/api/xennote/labels", async (req: Request, res: Response) => {
    const uid = callerId(req);
    const rows = await XenNote.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          archived: { $ne: true },
          ...visibleNotesFilter(uid),
        },
      },
      { $unwind: "$labels" },
      { $group: { _id: { $toLower: "$labels" }, name: { $first: "$labels" }, n: { $sum: 1 } } },
      { $sort: { n: -1, _id: 1 } },
    ]);
    res.json({ status: true, data: { labels: rows.map((r: any) => ({ name: r.name, count: r.n })) } });
  });

  app.post("/api/xennote/notes", validate(xenNoteCreateSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const note = new XenNote({ owner_id: uid, updated_by: uid });
    applyFields(note, req.body);
    await note.save();
    notifyChange(note);
    res.json({
      status: true,
      message: "Note saved",
      data: { note: await serializeNote(note, { uid, role: "owner" }) },
    });
  });

  app.get("/api/xennote/notes/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { note, role } = await loadNote(req, req.params.id as string, "view");
    res.json({
      status: true,
      data: { note: await serializeNote(note, { uid, role }) },
    });
  });

  // The notes that link to this one with [[its title]]: what the note editor shows as "Linked from". Only notes the
  // caller can see, not archived, newest first. A note with no title can't be linked to, so it has none.
  app.get(
    "/api/xennote/notes/:id/backlinks",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note } = await loadNote(req, req.params.id as string, "view");
      const title = note.title.trim();
      if (!title) return res.json({ status: true, data: { notes: [] } });

      // A cheap filter in the database (the words between brackets, spaces matched loosely), then the exact check below.
      const words = title.split(/\s+/).map(escapeRegex).join("\\s+");
      const candidates = await XenNote.find({
        _id: { $ne: note._id },
        archived: { $ne: true },
        ...visibleNotesFilter(uid),
        body: { $regex: `\\[\\[\\s*${words}\\s*(\\||\\]\\])`, $options: "i" },
      })
        .sort({ updated_at: -1 })
        .limit(100)
        .select("title type body updated_at");
      const notes = candidates
        .filter((n) => linksTo(n.body, title))
        .slice(0, 50)
        .map((n) => ({
          _id: n.id as string,
          title: n.title,
          type: n.type,
          updated_at: n.updated_at.toISOString(),
        }));
      res.json({ status: true, data: { notes } });
    },
  );

  app.get(
    "/api/xennote/notes/:id/mentions",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note } = await loadNote(req, req.params.id as string, "view");
      const title = note.title.trim();
      if (!title) return res.json({ status: true, data: { notes: [] } });
      const target = { id: String(note._id), title, aliases: [] };
      const words = title.split(/\s+/).map(escapeRegex).join("\\s+");
      const possible = await XenNote.find(
        {
          _id: { $ne: note._id },
          type: "text",
          archived: { $ne: true },
          ...visibleNotesFilter(uid),
          body: { $regex: words, $options: "i" },
        },
        "title body",
      )
        .sort({ updated_at: -1 })
        .limit(100)
        .lean();
      const notes = possible
        .flatMap((other) => {
          if (linksTo(other.body, title) || !linkFirstMention(markdownToDoc(other.body), target).changed) return [];
          return [{ _id: String(other._id), title: other.title, snippet: mentionSnippet(other.body, target) }];
        })
        .slice(0, 50);
      return res.json({ status: true, data: { notes } });
    },
  );

  app.put(
    "/api/xennote/notes/:id",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteUpdateSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, role } = await loadNote(req, req.params.id as string, "edit");

      // What the note said before this edit, so a change to its wording can be looked at and undone later.
      const before = contentOf(note);
      const wasSavedAt = note.updated_at;
      const wasSavedBy = note.updated_by ?? note.owner_id;
      applyFields(note, req.body);
      note.updated_by = uid;
      await note.save();
      if (contentChanged(before, note)) {
        await keepVersion(note._id, before, wasSavedAt, wasSavedBy).catch((e) =>
          console.error("xennote version failed:", e),
        );
      }
      notifyChange(note);
      res.json({
        status: true,
        message: "Note saved",
        data: {
          note: await serializeNote(note, { uid, role }),
        },
      });
    },
  );

  // Deleting a note moves it to the Trash, where the person who deleted it can restore it for 30 days. Its photos stay
  // with it until it is removed for good.
  app.delete("/api/xennote/notes/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const { note } = await loadNote(req, req.params.id as string, "manage");
    note.deleted_at = new Date();
    note.deleted_by = callerId(req);
    await note.save();
    notifyChange(note);
    res.json({ status: true, message: "Note moved to Trash" });
  });

  // ---- my reminder on a note. Personal, so anyone who can see the note (a viewer too) may set one for themselves, and it
  // changes nothing about the note: no save(), so the note's updated time and its place on the board stay as they are.
  app.put(
    "/api/xennote/notes/:id/reminder",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteReminderSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, role } = await loadNote(req, req.params.id as string, "view");
      const at: string | null = req.body.at;

      if (at === null) {
        await XenNote.updateOne({ _id: note._id }, { $pull: { reminders: { user_id: uid } } });
      } else {
        const when = new Date(at);
        // Replace my reminder if I have one (and make it unsent again), otherwise add it. The second filter keeps two
        // quick requests from adding two.
        const replaced = await XenNote.updateOne(
          { _id: note._id, "reminders.user_id": uid },
          { $set: { "reminders.$.at": when, "reminders.$.notified_at": null } },
        );
        if (replaced.matchedCount === 0) {
          await XenNote.updateOne(
            { _id: note._id, "reminders.user_id": { $ne: uid } },
            { $push: { reminders: { user_id: uid, at: when, notified_at: null } } },
          );
        }
      }

      const fresh = await XenNote.findById(note._id);
      if (!fresh) throw new AppError(404, "Note not found");
      res.json({
        status: true,
        message: at === null ? "Reminder removed" : "Reminder set",
        data: {
          note: await serializeNote(fresh, { uid, role }),
        },
      });
    },
  );

  // ---- a single note's public link: enable (keeps the current link), rotate, disable
  const share = (action: "enable" | "rotate" | "disable") => async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { note, role } = await loadNote(req, req.params.id as string, "manage");
    if (action === "disable") note.share = { enabled: false, token: note.share?.token };
    else
      note.share = {
        enabled: true,
        token: action === "enable" && note.share?.token ? note.share.token : randomToken(16),
      };
    await note.save();
    res.json({
      status: true,
      data: { note: await serializeNote(note, { uid, role }) },
    });
  };
  app.post("/api/xennote/notes/:id/share", validateParams(xenNoteIdParamSchema), share("enable"));
  app.post("/api/xennote/notes/:id/share/rotate", validateParams(xenNoteIdParamSchema), share("rotate"));
  app.delete("/api/xennote/notes/:id/share", validateParams(xenNoteIdParamSchema), share("disable"));
}
