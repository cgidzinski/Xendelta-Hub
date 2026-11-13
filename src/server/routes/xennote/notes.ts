import type { Request, Response } from "express";
import { recordActivity } from "../../activity";
import { Types } from "mongoose";
import {
  validate,
  validateParams,
  validateQuery,
  xenNoteCreateSchema,
  xenNoteIdParamSchema,
  xenNoteListQuerySchema,
  xenNoteReminderSchema,
  xenNoteUpdateSchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNote } from "../../models/xenNote";
import { randomToken } from "../../utils/tokens";
import { removeNotePhotos } from "../../utils/xenNoteFiles";
import { roleOf } from "../../utils/membership";
import { MAX_CHECKLIST_ITEMS, normalizeLabels } from "../../../shared/xennote/notes";
import { linksTo } from "../../../shared/xennote/wikiLinks";
import {
  escapeRegex,
  loadNote,
  loadNotebook,
  myNotebooks,
  namesForNotes,
  notifyChange,
  serializeNote,
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
  app.get("/api/xennote/notes", validateQuery(xenNoteListQuerySchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { notebook, archived, label, q } = req.query as Record<string, string | undefined>;

    const books = await myNotebooks(uid);
    const roles = new Map(books.map((b) => [b.id, roleOf(b.toObject(), uid)]));
    const mine = { notebook_id: null, owner_id: uid };

    let scope: Record<string, unknown>;
    if (notebook === "none") scope = mine;
    else if (notebook) {
      await loadNotebook(req, notebook, "view");
      scope = { notebook_id: new Types.ObjectId(notebook) };
    } else {
      scope = { $or: [mine, { notebook_id: { $in: books.map((b) => b._id) } }] };
    }

    const and: Record<string, unknown>[] = [scope, { archived: archived === "true" ? true : { $ne: true } }];
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
        serializeNote(n, { uid, role: n.notebook_id ? (roles.get(String(n.notebook_id)) ?? null) : "owner", names }),
      ),
    );
    res.json({ status: true, message: "Notes retrieved", data: { notes: data } });
  });

  // How many notes each part of the rail holds: everything, my private ones, and the archive.
  app.get("/api/xennote/counts", async (req: Request, res: Response) => {
    const uid = callerId(req);
    const books = await myNotebooks(uid);
    const visible = {
      $or: [{ notebook_id: null, owner_id: uid }, { notebook_id: { $in: books.map((b) => b._id) } }],
    };
    const [all, mine, archived] = await Promise.all([
      XenNote.countDocuments({ ...visible, archived: { $ne: true } }),
      XenNote.countDocuments({ notebook_id: null, owner_id: uid, archived: { $ne: true } }),
      XenNote.countDocuments({ ...visible, archived: true }),
    ]);
    res.json({ status: true, message: "Counts retrieved", data: { all, mine, archived } });
  });

  app.get("/api/xennote/labels", async (req: Request, res: Response) => {
    const uid = callerId(req);
    const books = await myNotebooks(uid);
    const rows = await XenNote.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          archived: { $ne: true },
          $or: [{ notebook_id: null, owner_id: uid }, { notebook_id: { $in: books.map((b) => b._id) } }],
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
    const notebookId: string | null = req.body.notebook_id ?? null;
    const book = notebookId ? await loadNotebook(req, notebookId, "edit") : null;

    const note = new XenNote({ owner_id: uid, notebook_id: notebookId, updated_by: uid });
    applyFields(note, req.body);
    await note.save();
    notifyChange(book, uid);
    if (book) {
      await recordActivity({
        actor: uid,
        verb: "xennote.note_created",
        object: { type: "note", id: note.id, label: note.title || undefined },
        space: { app: "xennote", id: book.id, label: book.name },
        audience: "space",
      });
    }
    res.json({
      status: true,
      message: "Note saved",
      data: { note: await serializeNote(note, { uid, role: book ? roleOf(book.toObject(), uid) : "owner" }) },
    });
  });

  app.get("/api/xennote/notes/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { note, notebook } = await loadNote(req, req.params.id as string, "view");
    res.json({
      status: true,
      data: { note: await serializeNote(note, { uid, role: notebook ? roleOf(notebook.toObject(), uid) : "owner" }) },
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

      const books = await myNotebooks(uid);
      // A cheap filter in the database (the words between brackets, spaces matched loosely), then the exact check below.
      const words = title.split(/\s+/).map(escapeRegex).join("\\s+");
      const candidates = await XenNote.find({
        _id: { $ne: note._id },
        archived: { $ne: true },
        $or: [{ notebook_id: null, owner_id: uid }, { notebook_id: { $in: books.map((b) => b._id) } }],
        body: { $regex: `\\[\\[\\s*${words}\\s*(\\||\\]\\])`, $options: "i" },
      })
        .sort({ updated_at: -1 })
        .limit(100)
        .select("title type notebook_id body updated_at");
      const notes = candidates
        .filter((n) => linksTo(n.body, title))
        .slice(0, 50)
        .map((n) => ({
          _id: n.id as string,
          title: n.title,
          type: n.type,
          notebook_id: n.notebook_id ? String(n.notebook_id) : null,
          updated_at: n.updated_at.toISOString(),
        }));
      res.json({ status: true, data: { notes } });
    },
  );

  app.put(
    "/api/xennote/notes/:id",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteUpdateSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, notebook } = await loadNote(req, req.params.id as string, "edit");
      let destination = notebook;

      // Moving a note: into another notebook (needs edit there) or out to a private loose note (author only)
      if (req.body.notebook_id !== undefined) {
        const to: string | null = req.body.notebook_id;
        const from = note.notebook_id ? String(note.notebook_id) : null;
        if (to !== from) {
          if (to) {
            destination = await loadNotebook(req, to, "edit");
          } else {
            if (note.owner_id !== uid) throw new AppError(403, "Only the person who wrote a note can make it private");
            destination = null;
          }
          note.notebook_id = to ? new Types.ObjectId(to) : null;
          // sharing is per place: a note that moves stops using its old public link
          note.share = { enabled: false, token: note.share?.token };
        }
      }

      applyFields(note, req.body);
      note.updated_by = uid;
      await note.save();
      notifyChange(notebook, note.owner_id);
      if (destination && destination !== notebook) notifyChange(destination, note.owner_id);
      res.json({
        status: true,
        message: "Note saved",
        data: {
          note: await serializeNote(note, { uid, role: destination ? roleOf(destination.toObject(), uid) : "owner" }),
        },
      });
    },
  );

  app.delete("/api/xennote/notes/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const { note, notebook } = await loadNote(req, req.params.id as string, "edit");
    await removeNotePhotos(note.images);
    const owner = note.owner_id;
    await note.deleteOne();
    notifyChange(notebook, owner);
    res.json({ status: true, message: "Note deleted" });
  });

  // ---- my reminder on a note. Personal, so anyone who can see the note (a viewer too) may set one for themselves, and it
  // changes nothing about the note: no save(), so the note's updated time and its place on the board stay as they are.
  app.put(
    "/api/xennote/notes/:id/reminder",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteReminderSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, notebook } = await loadNote(req, req.params.id as string, "view");
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
          note: await serializeNote(fresh, { uid, role: notebook ? roleOf(notebook.toObject(), uid) : "owner" }),
        },
      });
    },
  );

  // ---- a single note's public link: enable (keeps the current link), rotate, disable
  const share = (action: "enable" | "rotate" | "disable") => async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { note, notebook } = await loadNote(req, req.params.id as string, "edit");
    if (action === "disable") note.share = { enabled: false, token: note.share?.token };
    else
      note.share = {
        enabled: true,
        token: action === "enable" && note.share?.token ? note.share.token : randomToken(16),
      };
    await note.save();
    res.json({
      status: true,
      data: { note: await serializeNote(note, { uid, role: notebook ? roleOf(notebook.toObject(), uid) : "owner" }) },
    });
  };
  app.post("/api/xennote/notes/:id/share", validateParams(xenNoteIdParamSchema), share("enable"));
  app.post("/api/xennote/notes/:id/share/rotate", validateParams(xenNoteIdParamSchema), share("rotate"));
  app.delete("/api/xennote/notes/:id/share", validateParams(xenNoteIdParamSchema), share("disable"));
}
