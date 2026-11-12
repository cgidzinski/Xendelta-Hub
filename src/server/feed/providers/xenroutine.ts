import { XenRoutine } from "../../models/xenRoutine";
import type { AttentionProvider } from "./types";

const SOON_DAYS = 2;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Routines overdue (critical) and due within two days (warning). Routines the person muted stay quiet. */
export const routineProvider: AttentionProvider = {
  key: "xenroutine",
  async fetch(userId) {
    const now = new Date();
    const horizon = new Date(now.getTime() + SOON_DAYS * 86_400_000);
    const routines = await XenRoutine.find(
      { enabled: true, due_at: { $lte: horizon }, members: { $elemMatch: { user_id: userId, muted: { $ne: true } } } },
      "name due_at",
    )
      .sort({ due_at: 1 })
      .limit(100)
      .lean();

    const overdue = routines.filter((r) => r.due_at.getTime() <= now.getTime());
    const soon = routines.filter((r) => r.due_at.getTime() > now.getTime());
    const cards = [];
    if (overdue.length) {
      cards.push({
        key: "xenroutine:overdue",
        app: "xenroutine",
        severity: "critical" as const,
        title: `${plural(overdue.length, "routine", "routines")} overdue`,
        subtitle: overdue
          .slice(0, 2)
          .map((r) => r.name)
          .join(", "),
        link: "/internal/xenroutine",
        count: overdue.length,
      });
    }
    if (soon.length) {
      cards.push({
        key: "xenroutine:soon",
        app: "xenroutine",
        severity: "warning" as const,
        title: `${plural(soon.length, "routine", "routines")} due soon`,
        subtitle: soon
          .slice(0, 2)
          .map((r) => r.name)
          .join(", "),
        link: "/internal/xenroutine",
        count: soon.length,
      });
    }
    return cards;
  },
};
