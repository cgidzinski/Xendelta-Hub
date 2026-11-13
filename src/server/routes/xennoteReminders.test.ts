import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Reminders on notes: setting one through the routes, and the job that sends them. Real routes, models and database;
// only storage is faked.
vi.hoisted(() => {
  process.env.GCS_PUBLIC_BUCKET_NAME = "test-public";
  process.env.GCS_PRIVATE_BUCKET_NAME = "test-private";
});
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  generateSignedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

let t: TestApp;
let runNoteReminders: typeof import("../utils/xenNoteReminders").runNoteReminders;
beforeAll(async () => {
  t = await startTestApp([() => import("./xennote/index.js")]);
  ({ runNoteReminders } = await import("../utils/xenNoteReminders.js"));
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(async () => {
  await mongoose.model("Notification").deleteMany({});
});

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xennote${url}`).set(as(who)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xennote${url}`).set(as(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xennote${url}`).set(as(who)).send(body),
});
const note = async (who: U, body: object) => (await api(who).post("/notes", body)).body.data.note;
const sharedBook = async (owner: U, others: Array<[U, "editor" | "viewer"]>) => {
  const book = (await api(owner).post("/notebooks", { name: "Home" })).body.data.notebook;
  for (const [who, role] of others) {
    const r = await api(owner).post(`/notebooks/${book._id}/members`, { userIds: [String(who.user._id)], role });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  return book as { _id: string };
};
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
const remind = (who: U, id: string, at: Date | null) =>
  api(who).put(`/notes/${id}/reminder`, { at: at ? at.toISOString() : null });
// Reminders only: being added to a notebook sends its own notification.
const inbox = (who: U) =>
  mongoose
    .model("Notification")
    .find({ userId: String(who.user._id), title: /^Reminder:/ })
    .lean<any[]>();

describe("setting a reminder", () => {
  it("is saved, shown to me as mine, and can be changed and removed", async () => {
    const me = await createUser();
    const n = await note(me, { title: "Call the dentist" });
    expect(n.reminder).toBeNull();

    const set = await remind(me, n._id, inHours(2));
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data.note.reminder).toMatchObject({ sent: false });
    expect(new Date(set.body.data.note.reminder.at).getTime()).toBeGreaterThan(Date.now());

    const later = inHours(30);
    const changed = await remind(me, n._id, later);
    expect(new Date(changed.body.data.note.reminder.at).toISOString()).toBe(later.toISOString());
    expect(
      await mongoose
        .model("XenNote")
        .findById(n._id)
        .then((d: any) => d.reminders),
    ).toHaveLength(1);

    const listed = (await api(me).get("/notes")).body.data.notes.find((x: any) => x._id === n._id);
    expect(listed.reminder).not.toBeNull();

    const removed = await remind(me, n._id, null);
    expect(removed.body.data.note.reminder).toBeNull();
    expect(
      await mongoose
        .model("XenNote")
        .findById(n._id)
        .then((d: any) => d.reminders),
    ).toHaveLength(0);
  });

  it("refuses a time that has passed, isn't a date, or is absurdly far away", async () => {
    const me = await createUser();
    const n = await note(me, { title: "x" });
    expect((await remind(me, n._id, new Date(Date.now() - 60_000))).status).toBe(400);
    expect((await api(me).put(`/notes/${n._id}/reminder`, { at: "tomorrow-ish" })).status).toBe(400);
    expect((await api(me).put(`/notes/${n._id}/reminder`, {})).status).toBe(400);
    expect((await remind(me, n._id, new Date(Date.now() + 10 * 365 * 86_400_000))).status).toBe(400);
  });

  it("is personal: others in the notebook neither see it nor have theirs changed, and it doesn't touch the note", async () => {
    const [owner, editor, viewer] = await Promise.all([createUser(), createUser(), createUser()]);
    const book = await sharedBook(owner, [
      [editor, "editor"],
      [viewer, "viewer"],
    ]);
    const n = await note(owner, { title: "Shared list", notebook_id: book._id });

    await remind(owner, n._id, inHours(3));
    const viewerSet = await remind(viewer, n._id, inHours(5)); // a viewer can remind themselves
    expect(viewerSet.status).toBe(200);

    const seen = async (who: U) =>
      (await api(who).get(`/notes/${n._id}`)).body.data.note as { reminder: { at: string } | null; updated_at: string };
    expect((await seen(editor)).reminder).toBeNull();
    expect(new Date((await seen(owner)).reminder!.at).getTime()).toBeLessThan(
      new Date((await seen(viewer)).reminder!.at).getTime(),
    );

    // Setting reminders is not an edit: the note's updated time is unchanged.
    expect((await seen(owner)).updated_at).toBe(n.updated_at);
    await remind(viewer, n._id, null);
    expect((await seen(owner)).reminder).not.toBeNull();
  });

  it("is only for people who can see the note, and isn't in a public link", async () => {
    const [me, stranger] = await Promise.all([createUser(), createUser()]);
    const n = await note(me, { title: "Private" });
    expect((await remind(stranger, n._id, inHours(1))).status).toBe(404);
    expect((await request(t.app).put(`/api/xennote/notes/${n._id}/reminder`).send({ at: null })).status).toBe(401);

    await remind(me, n._id, inHours(1));
    const shared = (await api(me).post(`/notes/${n._id}/share`)).body.data.note;
    const pub = await request(t.app).get(`/api/xennote/public/note/${shared.share.token}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.body)).not.toContain("reminder");
  });
});

describe("sending reminders", () => {
  it("tells the person once, with a link to the note, when it comes due", async () => {
    const me = await createUser();
    const n = await note(me, {
      type: "checklist",
      title: "Groceries",
      checklist: [
        { text: "milk", done: true },
        { text: "eggs", done: false },
        { text: "bread", done: false },
      ],
    });
    await remind(me, n._id, inHours(1));

    await runNoteReminders(new Date()); // not due yet
    expect(await inbox(me)).toHaveLength(0);

    await runNoteReminders(inHours(2));
    const sent = await inbox(me);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      title: "Reminder: Groceries",
      message: "2 of 3 items still to do.",
      link: `/internal/xennote?note=${n._id}`,
      unread: true,
    });

    await runNoteReminders(inHours(3)); // already sent: not again
    expect(await inbox(me)).toHaveLength(1);
    const after = (await api(me).get(`/notes/${n._id}`)).body.data.note;
    expect(after.reminder.sent).toBe(true);

    // Setting a new time makes it live again.
    await remind(me, n._id, inHours(5));
    await runNoteReminders(inHours(6));
    expect(await inbox(me)).toHaveLength(2);
  });

  it("sends each person their own, and not to people who didn't ask", async () => {
    const [owner, editor, bystander] = await Promise.all([createUser(), createUser(), createUser()]);
    const book = await sharedBook(owner, [
      [editor, "editor"],
      [bystander, "viewer"],
    ]);
    const n = await note(owner, { title: "Plan", body: "Book the venue", notebook_id: book._id });
    await remind(owner, n._id, inHours(1));
    await remind(editor, n._id, inHours(2));

    await runNoteReminders(inHours(1.5));
    expect(await inbox(owner)).toHaveLength(1);
    expect(await inbox(editor)).toHaveLength(0);
    await runNoteReminders(inHours(3));
    expect(await inbox(editor)).toHaveLength(1);
    expect((await inbox(editor))[0].message).toBe("Book the venue");
    expect(await inbox(bystander)).toHaveLength(0);
  });

  it("doesn't tell someone who can no longer see the note", async () => {
    const [owner, member] = await Promise.all([createUser(), createUser()]);
    const book = await sharedBook(owner, [[member, "editor"]]);
    const n = await note(owner, { title: "Secret plans", notebook_id: book._id });
    await remind(member, n._id, inHours(1));

    await mongoose
      .model("XenNotebook")
      .updateOne({ _id: book._id }, { $pull: { members: { user_id: String(member.user._id) } } });
    await runNoteReminders(inHours(2));
    expect(await inbox(member)).toHaveLength(0);
    // and it is used up, not retried every minute
    const stored: any = await mongoose.model("XenNote").findById(n._id).lean();
    expect(stored.reminders[0].notified_at).toBeTruthy();
  });

  it("two runs at once send it once", async () => {
    const me = await createUser();
    const n = await note(me, { title: "Once only", body: "x" });
    await remind(me, n._id, inHours(1));
    await Promise.all([runNoteReminders(inHours(2)), runNoteReminders(inHours(2))]);
    expect(await inbox(me)).toHaveLength(1);
  });

  it("describes each kind of note", async () => {
    const { reminderMessage } = await import("../utils/xenNoteReminders.js");
    const base = { body: "", checklist: [], images: [] as unknown[], link: null };
    expect(reminderMessage({ ...base, type: "text", body: "  Pick up\n the   parcel " })).toBe("Pick up the parcel");
    expect(reminderMessage({ ...base, type: "text", body: "x".repeat(300) })).toHaveLength(120);
    expect(reminderMessage({ ...base, type: "text" })).toBe("Open the note.");
    expect(
      reminderMessage({
        ...base,
        type: "checklist",
        checklist: [
          { text: "a", done: true },
          { text: "", done: false },
        ],
      }),
    ).toBe("Everything on this list is ticked off.");
    expect(reminderMessage({ ...base, type: "image", images: [1] })).toBe("A note with a photo.");
    expect(reminderMessage({ ...base, type: "link", link: { url: "https://a.example", description: "" } })).toBe(
      "https://a.example",
    );
  });
});
