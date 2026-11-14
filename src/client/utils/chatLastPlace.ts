// Where the person was last in the chat screen (a DM or a channel), so the Chat button reopens it. A per-viewer
// convenience kept in the browser: it can be empty or unreadable and nothing breaks.
const KEY = "xenchat:lastPlace";

/** Only paths of a chat or a channel count (not a community's settings, nor the bare lists). */
export const isChatPlace = (path: string): boolean =>
  /^\/internal\/messages\/[a-f0-9]{24}$/.test(path) ||
  /^\/internal\/communities\/[a-f0-9]{24}\/[a-f0-9]{24}$/.test(path);

export function rememberChatPlace(path: string): void {
  if (!isChatPlace(path)) return;
  try {
    localStorage.setItem(KEY, path);
  } catch {
    // Private windows and blocked storage: not remembering is fine.
  }
}

export function lastChatPlace(): string | null {
  try {
    const path = localStorage.getItem(KEY);
    return path && isChatPlace(path) ? path : null;
  } catch {
    return null;
  }
}

export function forgetChatPlace(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
