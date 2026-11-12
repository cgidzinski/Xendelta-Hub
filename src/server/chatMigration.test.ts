import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1794600000000-chat-messages-collection";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

const oid = () => new mongoose.Types.ObjectId();

describe("chat messages -> own collection migration", () => {
  it("numbers messages in time order, keeps replies, roles and read positions, and clears the old fields", async () => {
    const conn = mongoose.connection;
    const users = conn.collection("users");
    const conversations = conn.collection("conversations");
    const messages = conn.collection("messages");

    const ann = await users.insertOne({ username: "ann" });
    const bob = await users.insertOne({ username: "bob" });
    const [a, b] = [String(ann.insertedId), String(bob.insertedId)];

    const m1 = oid(),
      m2 = oid(),
      m3 = oid();
    const convId = oid();
    // Stored out of order on purpose: m3 is the oldest.
    await conversations.insertOne({
      _id: convId,
      participants: [a, b],
      createdBy: a,
      name: "Dinner",
      updatedAt: new Date("2026-01-03T00:00:00Z"),
      messages: [
        { _id: m1, from: a, message: "second", time: new Date("2026-01-02T00:00:00Z") },
        {
          _id: m2,
          from: b,
          message: "third, a reply",
          time: new Date("2026-01-03T00:00:00Z"),
          parentMessageId: String(m1),
        },
        { _id: m3, from: a, message: "first", time: new Date("2026-01-01T00:00:00Z") },
      ],
    });
    // Ann has read everything; Bob read up to the second message.
    await users.updateOne(
      { _id: ann.insertedId },
      { $set: { conversations: [{ conversationId: convId, unread: false }] } },
    );
    await users.updateOne(
      { _id: bob.insertedId },
      {
        $set: {
          conversations: [{ conversationId: convId, unread: true, lastReadAt: new Date("2026-01-02T12:00:00Z") }],
        },
      },
    );
    await conversations.insertOne({ _id: oid(), participants: [], messages: [] }); // an empty shell is dropped

    await migration.up(conn);
    await migration.up(conn); // repeatable

    const rows = await messages.find({ conversationId: convId }).sort({ seq: 1 }).toArray();
    expect(rows.map((r) => [r.seq, r.body])).toEqual([
      [1, "first"],
      [2, "second"],
      [3, "third, a reply"],
    ]);
    expect(rows[2].replyTo).toBe(2);
    expect(rows[2].from).toBe(b);

    const conv = await conversations.findOne({ _id: convId });
    expect(conv!.participants).toBeUndefined();
    expect(conv!.messages).toBeUndefined();
    expect(conv!.createdBy).toBeUndefined();
    expect(conv!.name).toBe("Dinner");
    expect(conv!.seq).toBe(3);
    expect(conv!.rosterKey).toBe([a, b].sort().join(","));
    expect(conv!.lastMessage).toMatchObject({ seq: 3, from: b, preview: "third, a reply" });
    const byUser = Object.fromEntries(conv!.members.map((m: any) => [m.user_id, m]));
    expect(byUser[a]).toMatchObject({ role: "owner", lastReadSeq: 3 });
    expect(byUser[b]).toMatchObject({ role: "member", lastReadSeq: 2 });

    expect((await users.findOne({ _id: ann.insertedId }))!.conversations).toBeUndefined();
    expect(await conversations.countDocuments({})).toBe(1);

    await migration.down(conn);
    const back = await conversations.findOne({ _id: convId });
    expect(back!.participants).toEqual([a, b]);
    expect(back!.createdBy).toBe(a);
    expect(back!.messages.map((m: any) => m.message)).toEqual(["first", "second", "third, a reply"]);
    expect(back!.members).toBeUndefined();
    const bobAgain = await users.findOne({ _id: bob.insertedId });
    expect(bobAgain!.conversations[0]).toMatchObject({ unread: true });
    expect(await messages.countDocuments({})).toBe(0);
  });
});
