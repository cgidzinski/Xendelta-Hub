import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Editing an expense that is not part of a recurring series must work. (A type-narrowing change once
// made every such edit answer 404 "ScheduledTask not found".)

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xensplit.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("editing an expense", () => {
  it("updates a plain (non-recurring) expense", async () => {
    const owner = await createUser();
    const me = owner.user._id.toString();
    const created = await request(t.app)
      .post("/api/xensplit/groups")
      .set(auth(owner.token))
      .send({ name: "Trip", default_currency: "CAD" });
    const groupId = (created.body.data.group ?? created.body.data)._id;

    const added = await request(t.app)
      .post(`/api/xensplit/groups/${groupId}/expenses`)
      .set(auth(owner.token))
      .send({
        paid_by: me,
        amount: 20,
        currency: "CAD",
        title: "Lunch",
        date: new Date().toISOString(),
        split_type: "equal",
        splits: [{ user_id: me }],
      });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const expenseId = (added.body.data.group ?? added.body.data).expenses.at(-1)._id;

    const edited = await request(t.app)
      .put(`/api/xensplit/groups/${groupId}/expenses/${expenseId}`)
      .set(auth(owner.token))
      .send({ title: "Dinner", amount: 45 });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);

    const group = await request(t.app).get(`/api/xensplit/groups/${groupId}`).set(auth(owner.token));
    const expense = (group.body.data.group ?? group.body.data).expenses.find((e: any) => e._id === expenseId);
    expect(expense).toMatchObject({ title: "Dinner", amount: 45 });
  });
});
