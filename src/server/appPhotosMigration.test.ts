import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1794700000000-app-photos-to-xendrive";

// Two in-memory buckets stand in for storage; the database is real.
const { priv, pub } = vi.hoisted(() => ({ priv: new Set<string>(), pub: new Set<string>() }));
vi.mock("./config/gcs", () => {
  const bucket = (name: string, set: Set<string>) => ({
    name,
    file: (path: string) => ({
      path,
      set,
      getMetadata: async () => {
        if (!set.has(path)) throw new Error("not found");
        return [{ size: "100", contentType: "image/webp" }];
      },
      copy: async (dest: { path: string; set: Set<string> }) => void dest.set.add(dest.path),
      delete: async () => void set.delete(path),
    }),
  });
  return { privateBucket: bucket("private", priv), publicBucket: bucket("public", pub) };
});

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

const oid = () => new mongoose.Types.ObjectId();

describe("app photos -> XenDrive files migration", () => {
  it("tags every existing photo for its owner without counting it, moves kitchen photos private, and re-runs cleanly", async () => {
    const conn = mongoose.connection;
    const [ann, bob] = [String(oid()), String(oid())];

    const groupId = oid();
    const expenseId = oid();
    const splitImg = oid();
    await conn.collection("xensplits").insertOne({
      _id: groupId,
      name: "Trip",
      created_by: ann,
      members: [],
      expenses: [
        { _id: expenseId, title: "Dinner", images: [{ _id: splitImg, gcs_path: "xensplit-images/g/e/a.jpg" }] },
      ],
    });
    priv.add("xensplit-images/g/e/a.jpg");

    const bookId = oid();
    const budgetItem = oid();
    const budgetImg = oid();
    await conn.collection("xenbudgetbooks").insertOne({ _id: bookId, name: "Home", created_by: bob });
    await conn.collection("xenbudgetitems").insertOne({
      _id: budgetItem,
      book_id: bookId,
      created_by: ann, // a member added it; the book's creator stands in for the uploader
      images: [{ _id: budgetImg, gcs_path: "xenbudget-images/b/i/r.png" }],
    });
    priv.add("xenbudget-images/b/i/r.png");

    const noteId = oid();
    await conn.collection("xennotes").insertOne({
      _id: noteId,
      owner_id: ann,
      images: [
        { _id: oid(), gcs_path: "xennote/n/1.webp" },
        { _id: oid(), gcs_path: "xennote/n/missing.webp" }, // gone from storage: left as it was
      ],
    });
    priv.add("xennote/n/1.webp");

    const kitchenBook = oid();
    const kitchenItem = oid();
    const kitchenImg = oid();
    await conn
      .collection("xenkitchenbooks")
      .insertOne({ _id: kitchenBook, members: [{ user_id: bob, role: "owner" }] });
    await conn.collection("xenkitchenitems").insertOne({
      _id: kitchenItem,
      book_id: kitchenBook,
      title: "Pancakes",
      images: [{ _id: kitchenImg, gcs_path: "xenkitchen/b/i/p.webp", url: "https://public.example/p.webp" }],
    });
    pub.add("xenkitchen/b/i/p.webp");

    const chatFile = oid();
    await conn.collection("xendrivefiles").insertOne({
      _id: chatFile,
      owner_id: oid(),
      name: "plan.pdf",
      storage_path: "xendrive/x/plan.pdf",
      mimeType: "application/pdf",
      size: 6,
      source: { app: "chat", ref: "c" },
    });

    await migration.up(conn);
    await migration.up(conn); // re-running changes nothing

    const files = conn.collection("xendrivefiles");
    expect(
      await files.countDocuments({ "source.app": { $in: ["xensplit", "xenbudget", "xennote", "xenkitchen"] } }),
    ).toBe(4);
    // chat attachments already count, and the migration leaves them alone
    expect((await files.findOne({ _id: chatFile }))!.counted).toBeUndefined();

    const split = (await files.findOne({ "source.app": "xensplit" }))!;
    expect(split).toMatchObject({
      owner_id: new mongoose.Types.ObjectId(ann),
      storage_path: "xensplit-images/g/e/a.jpg",
      counted: false,
      size: 100,
      source: { app: "xensplit", ref: String(groupId) },
    });
    const group = await conn.collection("xensplits").findOne({ _id: groupId });
    expect(group!.expenses[0].images[0]).toMatchObject({ file_id: split._id, uploaded_by: ann });
    expect(group!.expenses[0].images[0].gcs_path).toBeUndefined();

    const budget = (await files.findOne({ "source.app": "xenbudget" }))!;
    expect(budget.owner_id.toString()).toBe(bob);
    expect(budget.source.ref).toBe(String(bookId));

    const note = await conn.collection("xennotes").findOne({ _id: noteId });
    expect(note!.images[0].file_id).toBeTruthy();
    expect(note!.images[1].file_id).toBeUndefined();
    expect(note!.images[1].gcs_path).toBe("xennote/n/missing.webp");

    // XenKitchen: a private copy exists, the item points at it, the public original is gone
    const kitchen = (await files.findOne({ "source.app": "xenkitchen" }))!;
    expect(kitchen.owner_id.toString()).toBe(bob);
    expect(kitchen.source.ref).toBe(String(kitchenItem));
    expect(priv.has(kitchen.storage_path)).toBe(true);
    expect(pub.has("xenkitchen/b/i/p.webp")).toBe(false);
    const item = await conn.collection("xenkitchenitems").findOne({ _id: kitchenItem });
    expect(item!.images[0]).toMatchObject({ file_id: kitchen._id });
    expect(item!.images[0].url).toBeUndefined();
    expect(item!.images[0].gcs_path).toBeUndefined();

    // and it all goes back
    await migration.down(conn);
    expect(
      await files.countDocuments({ "source.app": { $in: ["xensplit", "xenbudget", "xennote", "xenkitchen"] } }),
    ).toBe(0);
    const back = await conn.collection("xensplits").findOne({ _id: groupId });
    expect(back!.expenses[0].images[0]).toMatchObject({ gcs_path: "xensplit-images/g/e/a.jpg" });
    expect(back!.expenses[0].images[0].file_id).toBeUndefined();
    const kitchenBack = await conn.collection("xenkitchenitems").findOne({ _id: kitchenItem });
    expect(kitchenBack!.images[0].url).toMatch(/^https:\/\/storage\.googleapis\.com\/public\/xenkitchen\//);
    expect(pub.has(kitchenBack!.images[0].gcs_path)).toBe(true);
  });
});
