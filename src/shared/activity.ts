// The activity verbs: what can appear in the Home feed, and how each one reads.
//
// The server stores structured data only (who, which verb, which thing, which space). Everything a person reads
// is produced here, so a verb is added with one entry, the wording can change without touching stored rows, and a
// notification can reuse the same text later. `recordActivity` (server/activity) only accepts a verb defined here.
//
// `summary` and `aggregate` return plain text where **double asterisks** mark the part to show in bold.
import { formatMoney } from "./money";

export interface ActivityActor {
  id: string;
  username: string;
  avatar?: string | null;
}

export interface ActivityObject {
  type: string;
  id: string;
  label?: string;
}

export interface ActivitySpace {
  app: string;
  id: string;
  label?: string;
}

/** One entry of the feed, as the API returns it. Several stored events that merge are one entry with `count > 1`. */
export interface FeedEntry {
  /** The newest stored event in the entry. */
  id: string;
  /** Every stored event the entry covers (for hiding it). */
  ids: string[];
  verb: ActivityVerb;
  app: string;
  actor: ActivityActor | null;
  object: ActivityObject;
  space?: ActivitySpace;
  data: Record<string, unknown>;
  count: number;
  /** When the newest event happened (ISO). */
  createdAt: string;
}

interface ActivityDefinition {
  app: string;
  /** Where tapping the entry goes. */
  link: (e: FeedEntry) => string;
  /** One event. */
  summary: (e: FeedEntry) => string;
  /** Several events of this verb by one person in one space, `e.count` of them. Falls back to `summary`. */
  aggregate?: (e: FeedEntry) => string;
}

const who = (e: FeedEntry) => `**${e.actor?.username ?? "Someone"}**`;
const where = (e: FeedEntry) => (e.space?.label ? `**${e.space.label}**` : "a shared space");
const money = (e: FeedEntry, key: "amount" | "total") => {
  const value = e.data[key];
  const currency = typeof e.data.currency === "string" ? e.data.currency : "CAD";
  return typeof value === "number" ? formatMoney(value, currency) : "";
};

function defineActivity<T extends Record<string, ActivityDefinition>>(defs: T): T {
  return defs;
}

export const ACTIVITY = defineActivity({
  "xensplit.expense_created": {
    app: "xensplit",
    link: (e) => (e.space ? `/internal/xensplit/groups/${e.space.id}/expenses` : "/internal/xensplit"),
    summary: (e) =>
      `${who(e)} added **${e.object.label ?? "an expense"}** to ${where(e)}${money(e, "amount") ? ` · ${money(e, "amount")}` : ""}`,
    aggregate: (e) =>
      `${who(e)} added ${e.count} expenses to ${where(e)}${money(e, "total") ? ` · ${money(e, "total")}` : ""}`,
  },
  "xensplit.settlement_created": {
    app: "xensplit",
    link: (e) => (e.space ? `/internal/xensplit/groups/${e.space.id}/balances` : "/internal/xensplit"),
    summary: (e) => `${who(e)} recorded a payment of ${money(e, "amount")} in ${where(e)}`,
    aggregate: (e) => `${who(e)} recorded ${e.count} payments in ${where(e)}`,
  },
  "xensplit.member_added": {
    app: "xensplit",
    link: (e) => (e.space ? `/internal/xensplit/groups/${e.space.id}/overview` : "/internal/xensplit"),
    summary: (e) => `${who(e)} added you to ${where(e)}`,
  },
  "xennote.note_created": {
    app: "xennote",
    link: () => "/internal/xennote",
    summary: (e) => `${who(e)} added **${e.object.label || "a note"}** to ${where(e)}`,
    aggregate: (e) => `${who(e)} added ${e.count} notes to ${where(e)}`,
  },
  "xennote.notebook_shared": {
    app: "xennote",
    link: () => "/internal/xennote",
    summary: (e) => `${who(e)} shared the notebook ${where(e)} with you`,
  },
});

export type ActivityVerb = keyof typeof ACTIVITY;

export const isActivityVerb = (verb: string): verb is ActivityVerb => verb in ACTIVITY;

/** The text of an entry: the aggregate wording once events merged, the single wording otherwise. */
export function activityText(entry: FeedEntry): string {
  const def: ActivityDefinition | undefined = ACTIVITY[entry.verb];
  if (!def) return "";
  return entry.count > 1 && def.aggregate ? def.aggregate(entry) : def.summary(entry);
}

export const activityLink = (entry: FeedEntry): string => ACTIVITY[entry.verb]?.link(entry) ?? "/internal";
