import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// XenBudget books keep `members` + `created_by` as the source of truth and mirror them into the
// standard `roster`. These tests drive the real routes and check the roster follows every change.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenbudget/index.js")]);
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
