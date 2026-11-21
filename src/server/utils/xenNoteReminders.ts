import { XenNote, XenNotebook } from "../models/xenNote";
import { XenNotePage } from "../models/xenNotePage";
import { noteRole } from "../routes/xennote/shared";
import { canView } from "./membership";
import { notify } from "./notificationUtils";

// Sends the reminders people set on notes (routes/xennote/notes.ts). Runs every minute from the scheduler. A reminder
// goes to the person who set it, once, over the usual channels (the inbox, and a push to their devices).

/** Most notes handled in one run; a backlog (after downtime) is cleared over the next runs. */
const BATCH = 200;
const MESSAGE_MAX = 120;

const clip = (text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > MESSAGE_MAX ? `${t.slice(0, MESSAGE_MAX - 1).trimEnd()}…` : t;
};

/** A line saying what the note is about, for the notification. */
export function reminderMessage(note: {
  type: string;
  body: string;
  checklist: Array<{ text: string; done: boolean }>;
  link?: { url?: string | null; description?: string | null } | null;
  images: unknown[];
}): string {
  if (note.type === "checklist") {
    const items = note.checklist.filter((i) => i.text.trim());
    const open = items.filter((i) => !i.done).length;
    if (items.length === 0) return "Open the note.";
    return open === 0 ? "Everything on this list is ticked off." : `${open} of ${items.length} items still to do.`;
  }
  if (note.type === "link") return clip(note.link?.description || note.link?.url || "") || "Open the note.";
  if (note.type === "image" && !note.body.trim())
    return note.images.length > 1 ? "A note with photos." : "A note with a photo.";
  return clip(note.body) || "Open the note.";
}

interface Remindable {
  _id: unknown;
  title: string;
  reminders: Array<{ user_id: string; at: Date; notified_at?: Date | null }>;
}

interface Job<T extends Remindable> {
  kind: "note" | "page";
  items: T[];
  canRead: (item: T, uid: string) => Promise<boolean>;
  claim: (id: string, uid: string, at: Date, now: Date) => Promise<boolean>;
  message: (item: T) => string;
  link: (id: string) => string;
}

async function sendDue<T extends Remindable>(job: Job<T>, now: Date) {
  for (const item of job.items) {
    const id = String(item._id);
    for (const reminder of item.reminders) {
      if (reminder.at > now || reminder.notified_at) continue;
      try {
        if (!(await job.claim(id, reminder.user_id, reminder.at, now))) continue;
        if (!(await job.canRead(item, reminder.user_id))) continue;
        await notify(reminder.user_id, {
          app: "xennote",
          title: `Reminder: ${item.title.trim() || `Untitled ${job.kind}`}`,
          message: job.message(item),
          link: job.link(id),
          icon: "notifications",
        });
      } catch (error) {
        console.error(`XenNote reminder failed for ${job.kind} ${id}:`, error);
      }
    }
  }
}

/** Claim before sending so concurrent scheduler runs only notify once. Recheck the current share before delivery. */
export async function runNoteReminders(now: Date = new Date()): Promise<void> {
  const due = { reminders: { $elemMatch: { at: { $lte: now }, notified_at: null } } };
  const [notes, pages] = await Promise.all([XenNote.find(due).limit(BATCH), XenNotePage.find(due).limit(BATCH)]);
  const books = new Map<string, ReturnType<typeof fetchBook>>();
  async function fetchBook(id: string) {
    return XenNotebook.findById(id, "members").lean();
  }
  const bookFor = (id: string) => {
    const current = books.get(id) ?? fetchBook(id);
    books.set(id, current);
    return current;
  };
  const pending = (id: string, user_id: string, at: Date) => ({
    _id: id,
    reminders: { $elemMatch: { user_id, at, notified_at: null } },
  });

  await sendDue(
    {
      kind: "note",
      items: notes,
      canRead: async (note, uid) => {
        const fresh = await XenNote.findById(note._id, "owner_id members").lean();
        if (!fresh) return false;
        return !!noteRole(fresh, uid);
      },
      claim: async (id, uid, at, time) =>
        (await XenNote.updateOne(pending(id, uid, at), { $set: { "reminders.$.notified_at": time } })).modifiedCount ===
        1,
      message: reminderMessage,
      link: (id) => `/internal/xennote?note=${id}`,
    },
    now,
  );

  await sendDue(
    {
      kind: "page",
      items: pages,
      canRead: async (page, uid) => {
        const fresh = await XenNotePage.findById(page._id, "notebook_id").lean();
        const book = fresh ? await bookFor(String(fresh.notebook_id)) : null;
        return !!book && canView(book, uid);
      },
      claim: async (id, uid, at, time) =>
        (await XenNotePage.updateOne(pending(id, uid, at), { $set: { "reminders.$.notified_at": time } }))
          .modifiedCount === 1,
      message: (page) => clip(page.excerpt) || "Open the page.",
      link: (id) => `/internal/xennote/p/${id}`,
    },
    now,
  );
}
