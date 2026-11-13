import { XenNote, XenNotebook } from "../models/xenNote";
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

/**
 * Send every reminder that has come due. Each is claimed before it is sent (a compare-and-set on its unsent stamp), so
 * two overlapping runs, or a second server, can't send it twice. A person who can no longer see the note (removed from
 * its notebook, or it became private) is not told anything, and the reminder is simply used up.
 */
export async function runNoteReminders(now: Date = new Date()): Promise<void> {
  const notes = await XenNote.find({ reminders: { $elemMatch: { at: { $lte: now }, notified_at: null } } })
    .limit(BATCH)
    .exec();

  // Notebooks already looked up this run, so a notebook with many due notes is read once.
  const books = new Map<string, Parameters<typeof canView>[0]>();

  for (const note of notes) {
    const due = note.reminders.filter((r) => r.at <= now && !r.notified_at);
    for (const reminder of due) {
      try {
        const claim = await XenNote.updateOne(
          {
            _id: note._id,
            reminders: { $elemMatch: { user_id: reminder.user_id, at: reminder.at, notified_at: null } },
          },
          { $set: { "reminders.$.notified_at": now } },
        );
        if (claim.modifiedCount !== 1) continue;

        let allowed: boolean;
        if (note.notebook_id) {
          const key = String(note.notebook_id);
          if (!books.has(key)) books.set(key, (await XenNotebook.findById(note.notebook_id))?.toObject() ?? null);
          const book = books.get(key);
          allowed = !!book && canView(book, reminder.user_id);
        } else {
          allowed = note.owner_id === reminder.user_id;
        }
        if (!allowed) continue;

        await notify(reminder.user_id, {
          title: `Reminder: ${note.title.trim() || "Untitled note"}`,
          message: reminderMessage(note),
          link: `/internal/xennote?note=${note.id}`,
          icon: "notifications",
        });
      } catch (e) {
        console.error(`XenNote reminder failed for note ${note.id}:`, e);
      }
    }
  }
}
