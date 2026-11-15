import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { setTestEnv } from "../testing/testApp";

let storage: typeof import("./index");
beforeAll(async () => {
  setTestEnv();
  storage = await import("./index.js");
});
afterEach(() => {
  delete process.env.STORAGE_PUBLIC_BASE_URL;
});

describe("public links", () => {
  it("builds a link from the configured address, without a doubled slash", () => {
    process.env.STORAGE_PUBLIC_BASE_URL = "https://files.example.com/";
    expect(storage.publicUrlFor("avatar/u1.jpg")).toBe("https://files.example.com/avatar/u1.jpg");
  });

  it("finds the key behind our links and behind links stored before the move to R2", () => {
    process.env.STORAGE_PUBLIC_BASE_URL = "https://files.example.com";
    expect(storage.publicKeyFromUrl("https://files.example.com/avatar/u1.jpg?v=2")).toBe("avatar/u1.jpg");
    expect(storage.publicKeyFromUrl("https://storage.googleapis.com/xen-public/emoji/a%20b.png")).toBe("emoji/a b.png");
    expect(storage.publicKeyFromUrl("/avatars/default-avatar.png")).toBeNull();
    expect(storage.publicKeyFromUrl("https://elsewhere.example/x.png")).toBeNull();
    expect(storage.publicKeyFromUrl(undefined)).toBeNull();
  });
});

describe("the in-memory bucket", () => {
  it("stores, reads, lists, copies and deletes", async () => {
    const { privateStore, publicStore } = storage.memoryStores();
    await publicStore.put("a/1.txt", Buffer.from("hi"), { contentType: "text/plain" });
    expect(await publicStore.head("a/1.txt")).toMatchObject({ size: 2, contentType: "text/plain" });
    expect((await publicStore.list("a/")).map((o) => o.key)).toEqual(["a/1.txt"]);
    await privateStore.copyFrom(storage.publicStore, "a/1.txt", "b/1.txt");
    const chunks: Buffer[] = [];
    for await (const c of await privateStore.read("b/1.txt")) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).toString()).toBe("hi");
    await publicStore.delete("a/1.txt");
    await publicStore.delete("a/1.txt"); // a missing object is fine
    expect(await publicStore.exists("a/1.txt")).toBe(false);
    expect(await publicStore.head("a/1.txt")).toBeNull();
  });

  it("joins a multipart upload's parts in order, and an aborted one leaves nothing", async () => {
    const { privateStore } = storage.memoryStores();
    const id = await privateStore.startMultipart("big.bin", { contentType: "application/octet-stream" });
    const second = await privateStore.uploadPart("big.bin", id, 2, Buffer.from("world"));
    const first = await privateStore.uploadPart("big.bin", id, 1, Buffer.from("hello "));
    await privateStore.completeMultipart("big.bin", id, [
      { partNumber: 2, etag: second },
      { partNumber: 1, etag: first },
    ]);
    expect(privateStore.objects.get("big.bin")?.body.toString()).toBe("hello world");

    const gone = await privateStore.startMultipart("gone.bin", { contentType: "application/octet-stream" });
    await privateStore.uploadPart("gone.bin", gone, 1, Buffer.from("x"));
    await privateStore.abortMultipart("gone.bin", gone);
    expect(privateStore.openUploads()).not.toContain(gone);
    expect(await privateStore.exists("gone.bin")).toBe(false);
  });

  it("streams a new object in, for backups", async () => {
    const { privateStore } = storage.memoryStores();
    const { stream, done } = privateStore.write("db-backups/x.gz", { contentType: "application/gzip" });
    stream.write(Buffer.from("ab"));
    stream.end(Buffer.from("c"));
    await done;
    expect(privateStore.objects.get("db-backups/x.gz")?.body.toString()).toBe("abc");
  });
});
