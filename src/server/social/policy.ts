import type { Response } from "express";

// The one place a rule about people lives. The hub is open: anyone may message anyone and add anyone to a space, so
// every answer is yes. If privacy settings, blocking or friends are ever added, they go here and the routes that
// already ask do not change.
export type SocialAction = "message" | "addToSpace";

export function can(_actor: string, _target: string, _action: SocialAction): boolean {
  return true;
}

/**
 * Answers 403 and returns true when `actor` may not add every one of `targets` to a space; the route then just
 * returns. Written as a response, not a throw, because several member routes wrap their body in a try/catch that
 * would turn a thrown error into a 500.
 */
export function addRefused(res: Response, actor: string, targets: Iterable<string>): boolean {
  for (const target of targets) {
    if (!can(actor, target, "addToSpace")) {
      res.status(403).json({ status: false, message: "You can't add that person" });
      return true;
    }
  }
  return false;
}
