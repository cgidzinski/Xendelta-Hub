import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// XenBudget books keep `members` + `created_by` as the source of truth and mirror them into the
// standard `roster`. These tests drive the real routes and check the roster follows every change.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenbudget/index.js"), () => import("./xensplit.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const roster = async (bookId: string) => {
  const raw = await mongoose.connection
    .collection("xenbudgetbooks")
    .findOne({ _id: new mongoose.Types.ObjectId(bookId) });
  return (raw!.roster as Array<{ user_id: string; role: string }>).map((r) => [r.user_id, r.role]);
};

describe("XenBudget roster", () => {
  it("follows create, add member, transfer and remove", async () => {
    const [a, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
    const A = a.user._id.toString();
    const B = b.user._id.toString();
    const C = c.user._id.toString();

    const created = await request(t.app)
      .post("/api/xenbudget/books")
      .set(auth(a.token))
      .send({ name: "Home", memberIds: [B] });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const id = created.body.data._id ?? created.body.data.book?._id;
    expect(await roster(id)).toEqual([
      [A, "owner"],
      [B, "editor"],
    ]);

    // only the owner adds people
    const denied = await request(t.app)
      .post(`/api/xenbudget/books/${id}/members`)
      .set(auth(b.token))
      .send({ memberIds: [C] });
    expect(denied.status).toBe(403);
    const added = await request(t.app)
      .post(`/api/xenbudget/books/${id}/members`)
      .set(auth(a.token))
      .send({ memberIds: [C] });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(await roster(id)).toEqual([
      [A, "owner"],
      [B, "editor"],
      [C, "editor"],
    ]);

    // owner hands the book to B
    const moved = await request(t.app)
      .post(`/api/xenbudget/books/${id}/transfer`)
      .set(auth(a.token))
      .send({ userId: B });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(await roster(id)).toEqual([
      [A, "editor"],
      [B, "owner"],
      [C, "editor"],
    ]);

    // the old owner can no longer remove others; the new owner can; nobody removes the owner
    expect((await request(t.app).delete(`/api/xenbudget/books/${id}/members/${C}`).set(auth(a.token))).status).toBe(
      403,
    );
    expect((await request(t.app).delete(`/api/xenbudget/books/${id}/members/${B}`).set(auth(b.token))).status).toBe(
      400,
    );
    expect((await request(t.app).delete(`/api/xenbudget/books/${id}/members/${C}`).set(auth(b.token))).status).toBe(
      200,
    );
    expect(await roster(id)).toEqual([
      [A, "editor"],
      [B, "owner"],
    ]);
  });
});

describe("XenSplit roster", () => {
  it("follows create, add member, transfer, and the owner leaving", async () => {
    const [a, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
    const [A, B, C] = [a.user._id.toString(), b.user._id.toString(), c.user._id.toString()];
    const rosterOf = async (id: string) =>
      (
        (await mongoose.connection.collection("xensplits").findOne({ _id: new mongoose.Types.ObjectId(id) }))!
          .roster as Array<{
          user_id: string;
          role: string;
        }>
      ).map((r) => [r.user_id, r.role]);

    const created = await request(t.app)
      .post("/api/xensplit/groups")
      .set(auth(a.token))
      .send({ name: "Trip", default_currency: "CAD", memberIds: [B] });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const id = created.body.data.group?._id ?? created.body.data._id;
    expect(await rosterOf(id)).toEqual([
      [A, "owner"],
      [B, "editor"],
    ]);

    // any member adds people; a stranger cannot
    const stranger = await createUser();
    expect(
      (
        await request(t.app)
          .post(`/api/xensplit/groups/${id}/members`)
          .set(auth(stranger.token))
          .send({ memberIds: [C] })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .post(`/api/xensplit/groups/${id}/members`)
          .set(auth(b.token))
          .send({ memberIds: [C] })
      ).status,
    ).toBe(200);
    expect((await rosterOf(id)).length).toBe(3);

    // only the owner transfers, and only to a member
    expect(
      (await request(t.app).post(`/api/xensplit/groups/${id}/transfer`).set(auth(b.token)).send({ newOwnerId: C }))
        .status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .post(`/api/xensplit/groups/${id}/transfer`)
          .set(auth(a.token))
          .send({ newOwnerId: stranger.user._id.toString() })
      ).status,
    ).toBe(400);
    expect(
      (await request(t.app).post(`/api/xensplit/groups/${id}/transfer`).set(auth(a.token)).send({ newOwnerId: B }))
        .status,
    ).toBe(200);
    expect(await rosterOf(id)).toEqual([
      [A, "editor"],
      [B, "owner"],
      [C, "editor"],
    ]);

    // the owner leaving hands the group to someone else, and the roster agrees
    expect((await request(t.app).delete(`/api/xensplit/groups/${id}/members/${B}`).set(auth(b.token))).status).toBe(
      200,
    );
    const after = await rosterOf(id);
    expect(after.map((r) => r[0]).sort()).toEqual([A, C].sort());
    expect(after.filter((r) => r[1] === "owner").length).toBe(1);
  });
});
