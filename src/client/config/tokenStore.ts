// The one place the sign-in token is stored. Everything else (the axios client, the socket, the auth
// hook, the OAuth callback) goes through here, so a change is seen everywhere: when a request gets a
// 401 and the token is cleared, the auth state and socket reset instead of lingering as "signed in".

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "token";

export function createTokenStore(storage: StorageLike | undefined) {
  const listeners = new Set<(token: string | null) => void>();
  const emit = (token: string | null) => listeners.forEach((fn) => fn(token));

  return {
    get(): string | null {
      try {
        return storage?.getItem(KEY) ?? null;
      } catch {
        return null; // storage blocked: behave as signed out
      }
    },
    set(token: string): void {
      try {
        storage?.setItem(KEY, token);
      } catch {
        /* storage unavailable: this session cannot be kept */
      }
      emit(token);
    },
    clear(): void {
      try {
        storage?.removeItem(KEY);
      } catch {
        /* nothing to remove */
      }
      emit(null);
    },
    /** Called on every change, including a change made in another tab. Returns the unsubscribe. */
    subscribe(fn: (token: string | null) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Tell listeners about a change made elsewhere (another tab). */
    notify: emit,
  };
}

export const tokenStore = createTokenStore(typeof localStorage === "undefined" ? undefined : localStorage);

// A sign-out (or sign-in) in another tab fires `storage` here.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) tokenStore.notify(tokenStore.get());
  });
}
