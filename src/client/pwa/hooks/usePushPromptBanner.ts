import { useState } from "react";
import { usePushNotifications } from "./usePushNotifications";

// Drives the "Turn on notifications" banner shown to authenticated users who haven't
// decided on push yet. Kept separate from usePushNotifications (used by the Profile
// settings toggle) so that hook stays focused on subscribe/unsubscribe mechanics.
//
// There's no way to silently subscribe someone — the OS permission click is mandatory —
// so this is the closest thing to "opt-out": surface the prompt proactively instead of
// waiting for someone to find the Profile toggle themselves.

const DISMISS_KEY = "push-prompt-dismissed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function checkDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = new Date(raw).getTime();
  return !isNaN(ts) && Date.now() - ts < DISMISS_TTL_MS;
}

export function usePushPromptBanner() {
  const push = usePushNotifications();
  const [isDismissed, setIsDismissed] = useState(() => checkDismissed());

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setIsDismissed(true);
  };

  // permission !== "default" covers both outcomes of a real decision: "granted" means
  // subscribed is (or will be) true, and "denied" means the browser will refuse to
  // prompt again anyway — no need for our own dismiss state in either case.
  const visible =
    push.supported && !push.needsInstall && push.permission === "default" && !push.subscribed && !isDismissed;

  return { ...push, visible, dismiss };
}
