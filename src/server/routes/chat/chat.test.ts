import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

let t: TestApp;
// Every event the server emits, by the room it went to.
let sent: Array<{ room: string; event: string; payload: any }> = [];

beforeAll(async () => {
  t = await startTestApp([() => import("./index.js")]);
  const { SocketManager } = await import("../../infrastructure/SocketManager.js");
  (SocketManager.getInstance() as any).io = {
    to: (room: string) => ({ emit: (event: string, payload: any) => sent.push({ room, event, payload }) }),
    sockets: { adapter: { rooms: new Map() } },
  };
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

beforeEach(() => {
  sent = [];
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => String(u.user._id);

const open = async (me: U, others: U[], name?: string) => {
  const res = await request(t.app)
    .post("/api/chat/conversations")
    .set(as(me.token))
    .send({ userIds: others.map(id), ...(name ? { name } : {}) });
  expect(res.status).toBe(200);
  return res.body.data as { conversation: any; created: boolean };
};
const send = (me: U, chatId: string, body: string, extra: Record<string, unknown> = {}) =>
  request(t.app)
    .post(`/api/chat/conversations/${chatId}/messages`)
    .set(as(me.token))
    .send({ body, ...extra });

describe("starting a chat", () => {
  it("opens the same chat every time for the same pair (a DM is a group of two)", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const first = await open(a, [b]);
    expect(first.created).toBe(true);
    expect(first.conversation.members).toHaveLength(2);
    expect(first.conversation.members.find((m: any) => m.user_id === id(a)).role).toBe("owner");

    const again = await open(a, [b]);
    expect(again.created).toBe(false);
    expect(again.conversation._id).toBe(first.conversation._id);
    // and from the other side
    const fromB = await open(b, [a]);
    expect(fromB.conversation._id).toBe(first.conversation._id);
  });

  it("a named chat, or three people, is always a new group", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const dm = await open(a, [b]);
    const named = await open(a, [b], "Trip");
    expect(named.conversation._id).not.toBe(dm.conversation._id);
    const g1 = await open(a, [b, c]);
    const g2 = await open(a, [b, c]);
    expect(g1.conversation._id).not.toBe(g2.conversation._id);
  });

  it("refuses an empty pick and unknown people", async () => {
    const a = await createUser();
    const self = await request(t.app)
      .post("/api/chat/conversations")
      .set(as(a.token))
      .send({ userIds: [id(a)] });
    expect(self.status).toBe(400);
    const ghost = await request(t.app)
      .post("/api/chat/conversations")
      .set(as(a.token))
      .send({ userIds: [String(new mongoose.Types.ObjectId())] });
    expect(ghost.status).toBe(404);
  });

  it("is listed only once it has a message, and comes back after being hidden", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const empty = await request(t.app).get("/api/chat/conversations").set(as(a.token));
    expect(empty.body.data.conversations).toHaveLength(0);

    await send(a, conversation._id, "hello");
    const listed = await request(t.app).get("/api/chat/conversations").set(as(b.token));
    expect(listed.body.data.conversations).toHaveLength(1);
    expect(listed.body.data.conversations[0].lastMessage.preview).toBe("hello");

    await request(t.app)
      .patch(`/api/chat/conversations/${conversation._id}/me`)
      .set(as(b.token))
      .send({ hidden: true });
    expect((await request(t.app).get("/api/chat/conversations").set(as(b.token))).body.data.conversations).toHaveLength(
      0,
    );
    await send(a, conversation._id, "still there?");
    expect((await request(t.app).get("/api/chat/conversations").set(as(b.token))).body.data.conversations).toHaveLength(
      1,
    );
  });
});

describe("messages", () => {
  it("counts unread exactly, per person, and clears it when read", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const chatId = conversation._id;
    await send(a, chatId, "one");
    await send(a, chatId, "two");
    await send(a, chatId, "three");

    const asB = await request(t.app).get(`/api/chat/conversations/${chatId}`).set(as(b.token));
    expect(asB.body.data.conversation.unread).toBe(3);
    const asA = await request(t.app).get(`/api/chat/conversations/${chatId}`).set(as(a.token));
    expect(asA.body.data.conversation.unread).toBe(0);
    expect((await request(t.app).get("/api/chat/unread").set(as(b.token))).body.data.count).toBe(1);

    await request(t.app).post(`/api/chat/conversations/${chatId}/read`).set(as(b.token)).send({ seq: 2 });
    expect(
      (await request(t.app).get(`/api/chat/conversations/${chatId}`).set(as(b.token))).body.data.conversation.unread,
    ).toBe(1);
    await request(t.app).post(`/api/chat/conversations/${chatId}/read`).set(as(b.token)).send({ seq: 3 });
    expect((await request(t.app).get("/api/chat/unread").set(as(b.token))).body.data.count).toBe(0);
  });

  it("pages history newest first with ?before", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    for (let i = 1; i <= 7; i++) await send(a, conversation._id, `m${i}`);

    const url = `/api/chat/conversations/${conversation._id}/messages`;
    const p1 = await request(t.app).get(`${url}?limit=3`).set(as(b.token));
    expect(p1.body.data.messages.map((m: any) => m.body)).toEqual(["m7", "m6", "m5"]);
    expect(p1.body.data.hasMore).toBe(true);
    const p2 = await request(t.app).get(`${url}?limit=3&before=5`).set(as(b.token));
    expect(p2.body.data.messages.map((m: any) => m.body)).toEqual(["m4", "m3", "m2"]);
    const p3 = await request(t.app).get(`${url}?limit=3&before=2`).set(as(b.token));
    expect(p3.body.data.messages.map((m: any) => m.body)).toEqual(["m1"]);
    expect(p3.body.data.hasMore).toBe(false);
  });

  it("stores a retried send once", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const clientId = "client-12345678";
    const first = await send(a, conversation._id, "once", { clientId });
    const retry = await send(a, conversation._id, "once", { clientId });
    expect(retry.body.data.message._id).toBe(first.body.data.message._id);
    const all = await request(t.app).get(`/api/chat/conversations/${conversation._id}/messages`).set(as(a.token));
    expect(all.body.data.messages).toHaveLength(1);
  });

  it("keeps people who aren't in the chat out of it", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const chatId = conversation._id;
    await send(a, chatId, "private");
    for (const call of [
      request(t.app).get(`/api/chat/conversations/${chatId}`),
      request(t.app).get(`/api/chat/conversations/${chatId}/messages`),
      request(t.app).post(`/api/chat/conversations/${chatId}/messages`).send({ body: "hi" }),
      request(t.app).post(`/api/chat/conversations/${chatId}/read`).send({ seq: 1 }),
    ]) {
      expect((await call.set(as(outsider.token))).status).toBe(404);
    }
  });

  it("only sends events to the people in the chat", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    sent = [];
    await send(a, conversation._id, "hello");
    const rooms = sent.filter((s) => s.event === "chat:message").map((s) => s.room);
    expect(rooms.sort()).toEqual([`user:${id(a)}`, `user:${id(b)}`].sort());
    expect(rooms).not.toContain(`user:${id(outsider)}`);
  });

  it("lets the author edit and delete, and the owner delete, but nobody else", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const { conversation } = await open(a, [b, c], "Three");
    const chatId = conversation._id;
    const sentByB = (await send(b, chatId, "from b")).body.data.message;

    const byC = await request(t.app)
      .patch(`/api/chat/conversations/${chatId}/messages/${sentByB.seq}`)
      .set(as(c.token))
      .send({ body: "x" });
    expect(byC.status).toBe(403);
    const edited = await request(t.app)
      .patch(`/api/chat/conversations/${chatId}/messages/${sentByB.seq}`)
      .set(as(b.token))
      .send({ body: "edited" });
    expect(edited.body.data.message.body).toBe("edited");
    expect(edited.body.data.message.editedAt).toBeTruthy();

    expect(
      (await request(t.app).delete(`/api/chat/conversations/${chatId}/messages/${sentByB.seq}`).set(as(c.token)))
        .status,
    ).toBe(403);
    const byOwner = await request(t.app)
      .delete(`/api/chat/conversations/${chatId}/messages/${sentByB.seq}`)
      .set(as(a.token));
    expect(byOwner.body.data.message.deletedAt).toBeTruthy();
    expect(byOwner.body.data.message.body).toBe("");
  });

  it("adds and removes reactions", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const m = (await send(a, conversation._id, "party")).body.data.message;
    const base = `/api/chat/conversations/${conversation._id}/messages/${m.seq}/reactions/${encodeURIComponent("🎉")}`;
    await request(t.app).put(base).set(as(a.token));
    const second = await request(t.app).put(base).set(as(b.token));
    expect(second.body.data.message.reactions).toEqual([{ emoji: "🎉", userIds: [id(a), id(b)] }]);
    await request(t.app).delete(base).set(as(a.token));
    const last = await request(t.app).delete(base).set(as(b.token));
    expect(last.body.data.message.reactions).toEqual([]);
    const notEmoji = await request(t.app)
      .put(`/api/chat/conversations/${conversation._id}/messages/${m.seq}/reactions/abc`)
      .set(as(a.token));
    expect(notEmoji.status).toBe(400);
  });
});

describe("members", () => {
  it("turns a two-person chat into a group and the new person reads the history", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    await send(a, conversation._id, "before c");

    const added = await request(t.app)
      .post(`/api/chat/conversations/${conversation._id}/members`)
      .set(as(b.token))
      .send({ userIds: [id(c)] });
    expect(added.status).toBe(200);
    expect(added.body.data.conversation.members).toHaveLength(3);

    const history = await request(t.app).get(`/api/chat/conversations/${conversation._id}/messages`).set(as(c.token));
    const bodies = history.body.data.messages.map((m: any) => m.body);
    expect(bodies).toContain("before c");
    expect(history.body.data.messages.some((m: any) => m.kind === "system" && m.system.event === "added")).toBe(true);

    // The original pair now gets a fresh chat of their own, not the group.
    const again = await open(a, [b]);
    expect(again.created).toBe(true);
    expect(again.conversation._id).not.toBe(conversation._id);
  });

  it("lets only the owner remove people, and anyone leave", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const { conversation } = await open(a, [b, c], "Crew");
    const base = `/api/chat/conversations/${conversation._id}/members`;

    expect(
      (
        await request(t.app)
          .delete(`${base}/${id(c)}`)
          .set(as(b.token))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .delete(`${base}/${id(c)}`)
          .set(as(a.token))
      ).status,
    ).toBe(200);
    expect((await request(t.app).get(`/api/chat/conversations/${conversation._id}`).set(as(c.token))).status).toBe(404);

    expect(
      (
        await request(t.app)
          .delete(`${base}/${id(b)}`)
          .set(as(b.token))
      ).status,
    ).toBe(200);
    const left = await request(t.app).get(`/api/chat/conversations/${conversation._id}`).set(as(a.token));
    expect(left.body.data.conversation.members).toHaveLength(1);
  });

  it("hands the chat to the longest-standing member when the owner leaves, and deletes it when nobody is left", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const { conversation } = await open(a, [b, c], "Crew");
    const base = `/api/chat/conversations/${conversation._id}`;
    // make b clearly the longest-standing non-owner
    await mongoose
      .model("Conversation")
      .updateOne(
        { _id: conversation._id },
        { $set: { "members.$[b].joinedAt": new Date(Date.now() - 10_000) } },
        { arrayFilters: [{ "b.user_id": id(b) }] },
      );

    await request(t.app)
      .delete(`${base}/members/${id(a)}`)
      .set(as(a.token));
    const after = await request(t.app).get(base).set(as(b.token));
    const roles = Object.fromEntries(after.body.data.conversation.members.map((m: any) => [m.user_id, m.role]));
    expect(roles).toEqual({ [id(b)]: "owner", [id(c)]: "member" });

    await request(t.app)
      .delete(`${base}/members/${id(b)}`)
      .set(as(b.token));
    await request(t.app)
      .delete(`${base}/members/${id(c)}`)
      .set(as(c.token));
    expect(await mongoose.model("Conversation").countDocuments({ _id: conversation._id })).toBe(0);
    expect(await mongoose.model("Message").countDocuments({ conversationId: conversation._id })).toBe(0);
  });

  it("lets the owner hand the chat over", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const url = `/api/chat/conversations/${conversation._id}/members/${id(b)}`;
    expect((await request(t.app).patch(url).set(as(b.token)).send({ role: "owner" })).status).toBe(403);
    const done = await request(t.app).patch(url).set(as(a.token)).send({ role: "owner" });
    const roles = Object.fromEntries(done.body.data.conversation.members.map((m: any) => [m.user_id, m.role]));
    expect(roles).toEqual({ [id(a)]: "member", [id(b)]: "owner" });
  });

  it("lets any member rename, and an empty name clears it", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const url = `/api/chat/conversations/${conversation._id}`;
    const named = await request(t.app).patch(url).set(as(b.token)).send({ name: "Dinner" });
    expect(named.body.data.conversation.name).toBe("Dinner");
    const cleared = await request(t.app).patch(url).set(as(a.token)).send({ name: "" });
    expect(cleared.body.data.conversation.name).toBeNull();
  });
});

describe("attachments", () => {
  const makeFile = async (owner: U, name = "plan.pdf") => {
    const file = await mongoose.model("XenDriveFile").create({
      owner_id: owner.user._id,
      name,
      storage_path: `xendrive/${id(owner)}/${name}`,
      mimeType: "application/pdf",
      size: 1234,
    });
    return String(file._id);
  };

  it("attaches the sender's own XenDrive files, and refuses anyone else's", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const mine = await makeFile(a);
    const theirs = await makeFile(b, "secret.pdf");

    const ok = await send(a, conversation._id, "", { attachmentIds: [mine] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.message.attachments).toEqual([
      { fileId: mine, name: "plan.pdf", mimeType: "application/pdf", size: 1234 },
    ]);

    const stolen = await send(a, conversation._id, "", { attachmentIds: [theirs] });
    expect(stolen.status).toBe(400);
  });

  it("shows an attachment as removed once the file is gone from XenDrive", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    const fileId = await makeFile(a);
    await send(a, conversation._id, "see attached", { attachmentIds: [fileId] });
    await mongoose.model("XenDriveFile").collection.deleteOne({ _id: new mongoose.Types.ObjectId(fileId) });

    const history = await request(t.app).get(`/api/chat/conversations/${conversation._id}/messages`).set(as(b.token));
    expect(history.body.data.messages[0].attachments[0]).toMatchObject({ fileId, removed: true, name: "plan.pdf" });
  });

  it("rejects an empty message with nothing attached", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { conversation } = await open(a, [b]);
    expect((await send(a, conversation._id, "   ")).status).toBe(400);
  });
});
