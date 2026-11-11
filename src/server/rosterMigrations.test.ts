import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as budgetRoster from "../../migrations/1794428701239-budget-book-roster";

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
