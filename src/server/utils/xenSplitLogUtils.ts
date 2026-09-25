// Pure helpers for the XenSplit activity log - no model access, so they're unit-testable.

export type XenSplitLogAction =
  | "group_created" | "group_updated" | "group_image_updated" | "ownership_transferred"
  | "member_added" | "member_removed"
  | "expense_created" | "expense_updated" | "expense_deleted" | "expense_restored"
  | "expense_images_added" | "expense_image_removed"
  | "recurring_scheduled" | "recurring_generated" | "recurring_cancelled" | "recurring_paused"
  | "recurring_resumed" | "recurring_updated"
  | "settlement_created" | "settlement_deleted" | "settlement_restored"
  | "exchange_created" | "exchange_deleted" | "exchange_restored";

export type XenSplitLogTargetType = "group" | "member" | "expense" | "settlement" | "exchange" | "recurring";

export interface XenSplitLogChange {
  field: string;
  from: unknown;
  to: unknown;
}

export const EXPENSE_LOG_FIELDS = ["title", "amount", "currency", "paid_by", "date", "category", "notes", "split_type", "splits", "on_hold"];
export const GROUP_LOG_FIELDS = ["name", "default_currency", "secondary_currencies"];

// Reduces a field value to plain JSON so values read off a mongoose document compare
// equal to the same values from a request body. Blank values all collapse to null -
// clearing an unset category is not a change.
export function normaliseLogValue(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const plain = typeof (value as any)?.toObject === "function" ? (value as any).toObject() : value;
  if (Array.isArray(plain)) {
    return plain.map((item) => {
      // Splits are the only array of objects - keep just the fields a reader cares about
      if (item && typeof item === "object") {
        const out: Record<string, unknown> = { user_id: String(item.user_id) };
        if (item.amount_owed !== undefined && item.amount_owed !== null) out.amount_owed = item.amount_owed;
        if (item.percentage !== undefined && item.percentage !== null) out.percentage = item.percentage;
        return out;
      }
      return normaliseLogValue(item);
    });
  }
  if (plain && typeof plain === "object") return JSON.parse(JSON.stringify(plain));
  return plain;
}

/** The fields whose values differ between two snapshots, as {field, from, to}. */
export function diffFields(before: Record<string, any>, after: Record<string, any>, fields: string[]): XenSplitLogChange[] {
  const changes: XenSplitLogChange[] = [];
  for (const field of fields) {
    const from = normaliseLogValue(before?.[field]);
    const to = normaliseLogValue(after?.[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes;
}

const META_USER_KEYS = ["user_id", "from", "to", "paid_by", "party_a", "party_b"];

/** Every user id a log row refers to, so the endpoint can resolve names - including
 *  members who have since left the group. */
export function collectLogUserIds(row: { actor_id?: string | null; meta?: any; changes?: XenSplitLogChange[] }): string[] {
  const ids = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && /^[a-f0-9]{24}$/i.test(v)) ids.add(v);
  };
  add(row.actor_id);
  for (const key of META_USER_KEYS) add(row.meta?.[key]);
  for (const change of row.changes || []) {
    if (change.field === "paid_by") {
      add(change.from);
      add(change.to);
    } else if (change.field === "splits") {
      for (const side of [change.from, change.to]) {
        if (Array.isArray(side)) side.forEach((s: any) => add(s?.user_id));
      }
    }
  }
  return Array.from(ids);
}
