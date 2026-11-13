// Content shared into the app from another app's share sheet (the manifest's share_target). The service worker receives the
// shared form, keeps it here, and redirects to the Share page, which reads it back. IndexedDB, because a shared photo is a
// file and has to survive the redirect and a sign-in in between. Used from the service worker and from the page, so it
// touches nothing but indexedDB and FormData.

export interface SharedContent {
  title: string;
  text: string;
  url: string;
  files: File[];
  /** When it was shared (ms). */
  at: number;
}

const DB_NAME = "xendelta-share";
const STORE = "shares";
const KEY = "latest";
/** A share left unread for longer than this is stale and ignored. */
export const SHARE_MAX_AGE_MS = 60 * 60 * 1000;
/** The most files taken from one share. */
export const MAX_SHARED_FILES = 10;

/** The text fields and files of a shared form (what the browser POSTs for a share_target), as plain content. */
export function shareFromForm(form: FormData): Omit<SharedContent, "at"> {
  const field = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const files = form
    .getAll("files")
    .filter((v): v is File => typeof v !== "string" && v.size > 0)
    .slice(0, MAX_SHARED_FILES);
  return { title: field("title"), text: field("text"), url: field("url"), files };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Keep a share until the Share page reads it. Replaces any earlier unread one. */
export async function stashShare(content: Omit<SharedContent, "at">): Promise<void> {
  await run("readwrite", (store) => store.put({ ...content, at: Date.now() } satisfies SharedContent, KEY));
}

/** The waiting share, without removing it (so a reload of the page still has it), or null if none or too old. */
export async function peekShare(): Promise<SharedContent | null> {
  const found = await run<SharedContent | undefined>("readonly", (store) => store.get(KEY));
  return found && Date.now() - found.at <= SHARE_MAX_AGE_MS ? found : null;
}

/** Forget the waiting share (once it has been saved, or dismissed). */
export async function clearShare(): Promise<void> {
  await run("readwrite", (store) => store.delete(KEY));
}
