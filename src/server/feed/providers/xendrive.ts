import { User } from "../../models/user";
import { totalSpaceAllowed, usageFor } from "../../utils/xendriveUtils";
import type { AttentionProvider } from "./types";

const WARN_AT = 0.9;

/** Storage at 90% or more of what the person may use. */
export const driveProvider: AttentionProvider = {
  key: "xendrive",
  async fetch(userId) {
    const [user, usage] = await Promise.all([User.findById(userId, "xendrive").lean(), usageFor(userId)]);
    const allowed = totalSpaceAllowed(user?.xendrive?.spaceAllowed);
    const ratio = usage.spaceUsed / allowed;
    if (ratio < WARN_AT) return [];
    return [
      {
        key: "xendrive:storage",
        app: "xendrive",
        severity: ratio >= 1 ? "critical" : "warning",
        title: ratio >= 1 ? "Your drive is full" : `Your drive is ${Math.round(ratio * 100)}% full`,
        link: "/internal/xendrive",
        count: 1,
      },
    ];
  },
};
