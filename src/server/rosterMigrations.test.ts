import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as budgetRoster from "../../migrations/1794428701239-budget-book-roster";
import * as splitRoster from "../../migrations/1794428927038-split-group-roster";
import * as dropRecurring from "../../migrations/1794430096576-split-drop-legacy-recurring";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

const oid = () => new mongoose.Types.ObjectId();

describe("budget book roster migration", () => {
  it("backfills owner + editors, leaves the original fields alone, is repeatable, and reverses", async () => {
    const conn = mongoose.connection;
    const books = conn.collection("xenbudgetbooks");
    const [a, b] = [oid(), oid()];
    const { insertedId } = await books.insertOne({ name: "x", created_by: a.toString(), members: [a, b] });
    await books.insertOne({ name: "empty", created_by: a.toString(), members: [] });

    await budgetRoster.up(conn);
    await budgetRoster.up(conn);
    const book = await books.findOne({ _id: insertedId });
    expect(book!.roster.map((r: any) => [r.user_id, r.role])).toEqual([
      [a.toString(), "owner"],
      [b.toString(), "editor"],
    ]);
    expect(book!.members).toEqual([a, b]);
    expect(book!.created_by).toBe(a.toString());
    expect((await books.findOne({ name: "empty" }))!.roster).toEqual([]);

    await budgetRoster.down(conn);
    expect((await books.findOne({ _id: insertedId }))!.roster).toBeUndefined();
  });
});

describe("split group roster migration", () => {
  it("backfills owner + editors, leaves the original fields alone, is repeatable, and reverses", async () => {
    const conn = mongoose.connection;
    const groups = conn.collection("xensplits");
    const [a, b] = [oid(), oid()];
    const { insertedId } = await groups.insertOne({
      name: "g",
      created_by: b.toString(),
      members: [a, b],
      expenses: [],
    });

    await splitRoster.up(conn);
    await splitRoster.up(conn);
    const g = await groups.findOne({ _id: insertedId });
    expect(g!.roster.map((r: any) => [r.user_id, r.role])).toEqual([
      [a.toString(), "editor"],
      [b.toString(), "owner"],
    ]);
    expect(g!.members).toEqual([a, b]);
    expect(g!.created_by).toBe(b.toString());

    await splitRoster.down(conn);
    expect((await groups.findOne({ _id: insertedId }))!.roster).toBeUndefined();
  });
});

describe("split drop legacy recurring migration", () => {
  it("removes empty legacy arrays and never touches a non-empty one", async () => {
    const groups = mongoose.connection.collection("xensplits");
    const empty = await groups.insertOne({ name: "e", created_by: "x", members: [], recurring_expenses: [] });
    const full = await groups.insertOne({
      name: "f",
      created_by: "x",
      members: [],
      recurring_expenses: [{ frequency: "daily" }],
    });

    await dropRecurring.up(mongoose.connection);

    expect(await groups.findOne({ _id: empty.insertedId })).not.toHaveProperty("recurring_expenses");
    expect((await groups.findOne({ _id: full.insertedId }))!.recurring_expenses).toHaveLength(1);
  });
});
