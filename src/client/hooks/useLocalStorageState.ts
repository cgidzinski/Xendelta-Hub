import { useCallback, useState } from "react";

// A useState that remembers its value in localStorage. Storage is a per-browser
// convenience, never a requirement: it can be missing, blocked (private windows), full,
// or hold a value from an older version of the app, so every read and write is guarded
// and a stored value is only trusted if `isValid` accepts it.

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readStored<T>(storage: StorageLike | undefined, key: string, isValid: (v: unknown) => v is T, fallback: T): T {
    try {
        const raw = storage?.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        const parsed: unknown = JSON.parse(raw);
        return isValid(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

export function writeStored(storage: StorageLike | undefined, key: string, value: unknown): void {
    try {
        storage?.setItem(key, JSON.stringify(value));
    } catch {
        /* storage unavailable or full - the in-memory value still works */
    }
}

function browserStorage(): Storage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        return undefined; // accessing localStorage can itself throw when site data is blocked
    }
}

export function useLocalStorageState<T>(key: string, fallback: T, isValid: (v: unknown) => v is T): [T, (v: T) => void] {
    const [value, setValue] = useState<T>(() => readStored(browserStorage(), key, isValid, fallback));
    const set = useCallback((next: T) => {
        setValue(next);
        writeStored(browserStorage(), key, next);
    }, [key]);
    return [value, set];
}
