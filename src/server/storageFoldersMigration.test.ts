import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import { bucketView } from "./testing/storage";
import * as migration from "../../migrations/1795400000000-storage-folders";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("storage folders migration", () => {
  it("moves app files into <app>/<ref>/, leaves XenDrive uploads and missing objects, and re-runs cleanly", async () => {
    const files = mongoose.connection.collection("xendrivefiles");
    const priv = bucketView("private");
    const [u, g, c] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    priv.add("xensplit-images/x/y/receipt.jpg");
    priv.add(`xendrive/${u}/voice-1.webm`);
    priv.add(`xendrive/${u}/mine.pdf`);
    const { insertedIds } = await files.insertMany([
      { owner_id: u, storage_path: "xensplit-images/x/y/receipt.jpg", source: { app: "xensplit", ref: String(g) } },
      { owner_id: u, storage_path: `xendrive/${u}/voice-1.webm`, source: { app: "chat", ref: String(c) } },
      { owner_id: u, storage_path: `xendrive/${u}/mine.pdf` },
      { owner_id: u, storage_path: "xenbudget-images/gone.png", source: { app: "xenbudget", ref: String(g) } },
    ]);

    await migration.up(mongoose.connection);
    await migration.up(mongoose.connection);

    const path = async (i: number) => (await files.findOne({ _id: insertedIds[i] }))!.storage_path;
    expect(await path(0)).toBe(`xensplit/${g}/receipt.jpg`);
    expect(await path(1)).toBe(`chat/${c}/voice-1.webm`);
    expect(await path(2)).toBe(`xendrive/${u}/mine.pdf`);
    expect(await path(3)).toBe("xenbudget-images/gone.png");
    expect(priv.has(`xensplit/${g}/receipt.jpg`)).toBe(true);
    expect(priv.has("xensplit-images/x/y/receipt.jpg")).toBe(false);
    expect(priv.has(`chat/${c}/voice-1.webm`)).toBe(true);
    expect(priv.has(`xendrive/${u}/voice-1.webm`)).toBe(false);
    expect(priv.has(`xendrive/${u}/mine.pdf`)).toBe(true);
  });
});
