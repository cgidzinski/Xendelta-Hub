import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// The everyday paths of the two apps real people use, run through the real routes, models and
// validation against an in-memory database. They exist because a type-only change once made every
// expense edit fail in production while all the narrower tests still passed: if the main screens'
// create / edit / delete / settle calls stop working, this fails.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xensplit.js"), () => import("./xenbudget/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const unwrapGroup = (body: any) => body.data.group ?? body.data;

describe("XenSplit everyday flow", () => {
  it("add, edit, split, settle, exchange, delete and restore", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const [A, B] = [a.user._id.toString(), b.user._id.toString()];
    const api = (method: "get" | "post" | "put" | "delete", url: string, who = a) =>
      request(t.app)[method](url).set(auth(who.token));

    // group with two people
    const created = await api("post", "/api/xensplit/groups").send({
      name: "Trip",
      default_currency: "CAD",
      memberIds: [B],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const groupId = unwrapGroup(created.body)._id;
    const g = `/api/xensplit/groups/${groupId}`;

    // add an equal-split expense paid by A
    const added = await api("post", `${g}/expenses`).send({
      paid_by: A,
      amount: 60,
      currency: "CAD",
      title: "Cabin",
      date: new Date().toISOString(),
      split_type: "equal",
      splits: [{ user_id: A }, { user_id: B }],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const expenseId = unwrapGroup(added.body).expenses.at(-1)._id;

    // B owes A 30
    const balances = await api("get", `${g}/balances`, b);
    expect(balances.status, JSON.stringify(balances.body)).toBe(200);

    // edit (title, amount): the case that broke
    const edited = await api("put", `${g}/expenses/${expenseId}`).send({ title: "Cabin (2 nights)", amount: 80 });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    let group = unwrapGroup((await api("get", g)).body);
    expect(group.expenses.find((e: any) => e._id === expenseId)).toMatchObject({
      title: "Cabin (2 nights)",
      amount: 80,
    });

    // switch to exact splits
    const exact = await api("put", `${g}/expenses/${expenseId}`).send({
      split_type: "exact",
      splits: [
        { user_id: A, amount_owed: 50 },
        { user_id: B, amount_owed: 30 },
      ],
    });
    expect(exact.status, JSON.stringify(exact.body)).toBe(200);

    // B pays A back
    const settled = await api("post", `${g}/settle`, b).send({ from: B, to: A, amount: 30, currency: "CAD" });
    expect(settled.status, JSON.stringify(settled.body)).toBe(200);
    group = unwrapGroup((await api("get", g)).body);
    expect(group.settlements).toHaveLength(1);

    // a currency exchange between the two
    const exchange = await api("post", `${g}/exchanges`).send({
      party_a: A,
      currency_a: "CAD",
      amount_a: 10,
      party_b: B,
      currency_b: "USD",
      rate: 0.7,
    });
    expect(exchange.status, JSON.stringify(exchange.body)).toBe(200);

    // B did not create this expense and does not own the group, so B cannot edit it
    const forbidden = await api("put", `${g}/expenses/${expenseId}`, b).send({ title: "hijack" });
    expect(forbidden.status).toBe(403);

    // soft delete, then restore (owner)
    const deleted = await api("delete", `${g}/expenses/${expenseId}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    const restored = await api("post", `${g}/expenses/${expenseId}/restore`);
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);

    // the activity log reads (owner only)
    expect((await api("get", `${g}/log`)).status).toBe(200);
    expect((await api("get", `${g}/log`, b)).status).toBe(403);
  });
});

describe("XenBudget everyday flow", () => {
  it("create a book, add / edit / delete an item, read the summary", async () => {
    const owner = await createUser();
    const api = (method: "get" | "post" | "put" | "delete", url: string) =>
      request(t.app)[method](url).set(auth(owner.token));

    const created = await api("post", "/api/xenbudget/books").send({ name: "Home", default_currency: "CAD" });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const bookId = (created.body.data.book ?? created.body.data)._id;
    const b = `/api/xenbudget/books/${bookId}`;

    const item = await api("post", `${b}/items`).send({
      type: "expense",
      amount: 25.5,
      currency: "CAD",
      date: new Date().toISOString(),
      description: "Groceries",
    });
    expect(item.status, JSON.stringify(item.body)).toBe(200);
    const itemId = (item.body.data.item ?? item.body.data)._id;

    const edited = await api("put", `${b}/items/${itemId}`).send({ description: "Groceries (weekly)", amount: 30 });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);

    const list = await api("get", `${b}/items`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const items = list.body.data.items ?? list.body.data;
    expect(items.find((i: any) => i._id === itemId)).toMatchObject({ description: "Groceries (weekly)", amount: 30 });

    const summary = await api("get", `${b}/summary`);
    expect(summary.status, JSON.stringify(summary.body)).toBe(200);

    const removed = await api("delete", `${b}/items/${itemId}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const after = await api("get", `${b}/items`);
    expect((after.body.data.items ?? after.body.data).some((i: any) => i._id === itemId)).toBe(false);
  });
});
