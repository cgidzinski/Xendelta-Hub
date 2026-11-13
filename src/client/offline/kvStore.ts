// A tiny key-value store for the offline features: IndexedDB in the app, memory in tests (and as the fallback when IndexedDB
// isn't available, which behaves as "nothing is kept", never as an error).

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => void data.set(key, structuredClone(value)),
    delete: async (key) => void data.delete(key),
  };
}

const DB_NAME = "xendelta-offline";
const STORE = "kv";

/** IndexedDB, opened on first use. Every failure (no IndexedDB, private mode, quota) turns into "nothing stored". */
export function indexedDbStore(): KeyValueStore {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));

  async function run<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | undefined> {
    try {
      const db = await open();
      return await new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return undefined;
    }
  }

  return {
    get: <T>(key: string) => run<T>("readonly", (s) => s.get(key)) as Promise<T | undefined>,
    set: async (key, value) => void (await run("readwrite", (s) => s.put(value, key))),
    delete: async (key) => void (await run("readwrite", (s) => s.delete(key))),
  };
}
