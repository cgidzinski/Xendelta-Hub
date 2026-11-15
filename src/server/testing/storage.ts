import { memoryStores } from "../storage";

/**
 * A set-like view of one in-memory bucket (STORAGE_DRIVER=memory, set by testApp.ts), for tests that only care which
 * objects exist. `add` stores a small placeholder object.
 */
export function bucketView(which: "private" | "public") {
  const store = () => memoryStores()[which === "private" ? "privateStore" : "publicStore"];
  return {
    add: (key: string, contentType = "image/webp") =>
      void store().objects.set(key, { body: Buffer.alloc(42), contentType, lastModified: new Date() }),
    has: (key: string) => store().objects.has(key),
    delete: (key: string) => store().objects.delete(key),
    clear: () => store().clear(),
    get size() {
      return store().objects.size;
    },
  };
}
