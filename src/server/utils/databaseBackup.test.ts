import { describe, it, expect } from "vitest";
import { PassThrough, Readable } from "stream";
import { ObjectId } from "bson";
import type { Db, Document } from "mongodb";
import { streamExport, restoreFromGzipStream, listBackupCollections, getCollectionStats } from "./databaseBackup";

// Minimal fake of the native driver surface databaseBackup.ts actually touches
// (listCollections, collection().find/deleteMany/insertMany/estimatedDocumentCount),
// so the streaming/EJSON/batching/wipe-and-replace logic can be exercised without a
// live MongoDB server.
class FakeCollection {
  docs: Document[] = [];

  find(_query: Record<string, never>) {
    const docs = this.docs;
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next() {
            if (i < docs.length) return { value: docs[i++], done: false as const };
            return { value: undefined, done: true as const };
          },
        };
      },
    };
  }

  async deleteMany(_query: Record<string, never>) {
    const deletedCount = this.docs.length;
    this.docs = [];
    return { deletedCount };
  }

  async insertMany(docs: Document[], _opts: { ordered: boolean }) {
    this.docs.push(...docs);
    return { insertedCount: docs.length };
  }

  async estimatedDocumentCount() {
    return this.docs.length;
  }
}

class FakeDb {
  collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection());
    return this.collections.get(name)!;
  }

  listCollections(_filter?: Record<string, never>, _opts?: Record<string, unknown>) {
    const names = [...this.collections.keys()];
    return { toArray: async () => names.map((name) => ({ name })) };
  }
}

async function collectStream(dest: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of dest) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

describe("databaseBackup", () => {
  it("enumerates collections and filters out system.* ones", async () => {
    const db = new FakeDb();
    db.collection("users");
    db.collection("system.indexes");
    db.collection("posts");

    const names = await listBackupCollections(db as unknown as Db);
    expect(names).toEqual(["posts", "users"]);
  });

  it("reports document counts per collection", async () => {
    const db = new FakeDb();
    db.collection("users").docs.push({ _id: new ObjectId() }, { _id: new ObjectId() });
    db.collection("posts").docs.push({ _id: new ObjectId() });

    const stats = await getCollectionStats(db as unknown as Db);
    expect(stats).toEqual(
      expect.arrayContaining([
        { name: "users", count: 2 },
        { name: "posts", count: 1 },
      ])
    );
  });

  it("round-trips ObjectId/Date fields and wipes+replaces target collections on restore", async () => {
    const sourceDb = new FakeDb();
    const userId = new ObjectId();
    const createdAt = new Date("2024-01-15T10:00:00.000Z");
    sourceDb.collection("users").docs.push({ _id: userId, username: "alice", createdAt, roles: ["admin"] });
    sourceDb.collection("posts").docs.push(
      { _id: new ObjectId(), title: "first", author: userId },
      { _id: new ObjectId(), title: "second", author: userId }
    );

    // Export
    const dest = new PassThrough();
    const collected = collectStream(dest);
    await streamExport(sourceDb as unknown as Db, dest, { exportedBy: "tester" });
    const dumpBuffer = await collected;

    // Target DB has different/stale data before restore, including a collection
    // absent from the dump entirely - proving true wipe-and-replace.
    const targetDb = new FakeDb();
    targetDb.collection("users").docs.push({ _id: new ObjectId(), username: "old-stale-user" });
    targetDb.collection("stale").docs.push({ _id: new ObjectId(), leftover: true });

    const summaries = await restoreFromGzipStream(targetDb as unknown as Db, Readable.from(dumpBuffer));

    // "stale" was wiped and nothing in the dump restores into it.
    expect(targetDb.collection("stale").docs).toHaveLength(0);
    const staleSummary = summaries.find((s) => s.name === "stale")!;
    expect(staleSummary.deleted).toBe(1);
    expect(staleSummary.inserted).toBe(0);

    // "users" was wiped then repopulated from the dump with types preserved.
    const restoredUsers = targetDb.collection("users").docs;
    expect(restoredUsers).toHaveLength(1);
    expect(restoredUsers[0]._id).toBeInstanceOf(ObjectId);
    expect((restoredUsers[0]._id as ObjectId).equals(userId)).toBe(true);
    expect(restoredUsers[0].createdAt).toBeInstanceOf(Date);
    expect((restoredUsers[0].createdAt as Date).toISOString()).toBe(createdAt.toISOString());
    expect(restoredUsers[0].username).toBe("alice");

    const usersSummary = summaries.find((s) => s.name === "users")!;
    expect(usersSummary.deleted).toBe(1);
    expect(usersSummary.inserted).toBe(1);

    // "posts" didn't exist in targetDb before restore - it's created fresh from the dump.
    const restoredPosts = targetDb.collection("posts").docs;
    expect(restoredPosts).toHaveLength(2);
    expect(restoredPosts.every((p) => (p.author as ObjectId).equals(userId))).toBe(true);
    const postsSummary = summaries.find((s) => s.name === "posts")!;
    expect(postsSummary.deleted).toBe(0);
    expect(postsSummary.inserted).toBe(2);
  });

  it("batches inserts across the 500-document batch boundary", async () => {
    const sourceDb = new FakeDb();
    const docs = Array.from({ length: 1200 }, (_, i) => ({ _id: new ObjectId(), seq: i }));
    sourceDb.collection("bulk").docs.push(...docs);

    const dest = new PassThrough();
    const collected = collectStream(dest);
    await streamExport(sourceDb as unknown as Db, dest, { exportedBy: "tester" });
    const dumpBuffer = await collected;

    const targetDb = new FakeDb();
    const summaries = await restoreFromGzipStream(targetDb as unknown as Db, Readable.from(dumpBuffer));

    expect(targetDb.collection("bulk").docs).toHaveLength(1200);
    const bulkSummary = summaries.find((s) => s.name === "bulk")!;
    expect(bulkSummary.inserted).toBe(1200);
    // Canonical EJSON round-trips small integers as BSON Int32 wrapper objects (not plain
    // JS numbers) - correct behavior for a real insertMany, so unwrap with valueOf() here.
    expect(targetDb.collection("bulk").docs.map((d) => Number(d.seq))).toEqual(docs.map((d) => d.seq));
  });
});
