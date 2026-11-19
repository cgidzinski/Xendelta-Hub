import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenSplitNudge } from "../models/xenSplit";

// Reminding someone who owes you to settle up: only a real debt, once a day, and they are told.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xensplit.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
const id = (u: U) => String(u.user._id);

/** A group of `people`, with the first one having paid 40 for everyone to share equally. */
async function group(people: U[]) {
  const [payer, ...others] = people;
  const created = await request(t.app)
    .post("/api/xensplit/groups")
    .set(auth(payer))
    .send({ name: "Trip", default_currency: "CAD", memberIds: others.map(id) });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const groupId = (created.body.data.group ?? created.body.data)._id as string;
  const expense = await request(t.app)
    .post(`/api/xensplit/groups/${groupId}/expenses`)
    .set(auth(payer))
    .send({
      paid_by: id(payer),
      amount: 40,
      currency: "CAD",
      title: "Dinner",
      date: new Date().toISOString(),
      split_type: "equal",
      splits: people.map((p) => ({ user_id: id(p) })),
    });
  expect(expense.status, JSON.stringify(expense.body)).toBe(200);
  return groupId;
}
const nudge = (from: U, groupId: string, to: U | string) =>
  request(t.app)
    .post(`/api/xensplit/groups/${groupId}/nudge`)
    .set(auth(from))
    .send({ userId: typeof to === "string" ? to : id(to) });
/** The reminders someone has received (they also get notices about being added and about expenses). */
const inbox = (u: U) =>
  mongoose.model("Notification").find({ userId: u.user._id, title: "Time to settle up" }).lean() as Promise<any[]>;

describe("reminding someone to settle up", () => {
  it("tells the person who owes, and names the amount", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const g = await group([a, b]);
    const res = await nudge(a, g, b);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const mail = await inbox(b);
    expect(mail).toHaveLength(1);
    expect(mail[0].title).toBe("Time to settle up");
    expect(mail[0].message).toContain(a.user.username);
    expect(mail[0].message).toContain("20 CAD");
    expect(mail[0].link).toBe(`/internal/xensplit/groups/${g}/settlements`);
  });

  it("only once a day for the same person, but others, and the next day, are fine", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const g = await group([a, b, c]);
    expect((await nudge(a, g, b)).status).toBe(200);
    expect((await nudge(a, g, b)).status).toBe(429);
    expect((await nudge(a, g, c)).status).toBe(200);
    expect(await inbox(b)).toHaveLength(1);

    // The row the limit is made of is removed by the database after a day.
    await XenSplitNudge.deleteMany({ group_id: g, from_id: id(a), to_id: id(b) });
    expect((await nudge(a, g, b)).status).toBe(200);
  });

  it("is only for someone who owes you, and for members of the group", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const g = await group([a, b]);
    // a is owed by b, so b can't remind a (a owes nothing), nobody can remind themselves, and c is not in the group.
    expect((await nudge(b, g, a)).status).toBe(400);
    expect((await nudge(a, g, a)).status).toBe(400);
    expect((await nudge(a, g, c)).status).toBe(404);
    expect((await nudge(c, g, b)).status).toBe(403);
    expect((await nudge(a, g, "nope")).status).toBe(400);
    expect(await inbox(a)).toHaveLength(0);
    expect(await inbox(b)).toHaveLength(0);
  });

  it("stops being possible once the debt is settled", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const g = await group([a, b]);
    const paid = await request(t.app)
      .post(`/api/xensplit/groups/${g}/settle`)
      .set(auth(b))
      .send({ from: id(b), to: id(a), amount: 20, currency: "CAD" });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect((await nudge(a, g, b)).status).toBe(400);
  });
});
