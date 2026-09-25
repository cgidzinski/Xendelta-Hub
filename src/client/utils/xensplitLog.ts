import type { XenSplitLogChange, XenSplitLogEntry } from "../hooks/xensplit/types";
import { formatCurrency } from "./currencyUtils";
import { formatDateOnly } from "./dateGrouping";

export interface DescribedLogEntry {
    /** Who did it - a username, or "Recurring schedule" for system actions */
    actor: string;
    /** The rest of the sentence, starting lowercase after the actor */
    text: string;
    /** One line per changed field, for *_updated entries */
    details: string[];
}

const FIELD_LABELS: Record<string, string> = {
    title: "Title",
    amount: "Amount",
    currency: "Currency",
    paid_by: "Paid by",
    date: "Date",
    category: "Category",
    notes: "Notes",
    split_type: "Split",
    splits: "Shares",
    on_hold: "Hold",
    name: "Name",
    default_currency: "Primary currency",
    secondary_currencies: "Secondary currencies",
    end_date: "End date",
    max_occurrences: "Max occurrences",
    active: "Schedule",
};

function money(amount: unknown, currency: unknown): string {
    if (typeof amount !== "number") return "";
    try {
        return formatCurrency(amount, typeof currency === "string" ? currency : "CAD");
    } catch {
        return `${amount} ${currency ?? ""}`.trim();
    }
}

function formatValue(field: string, value: unknown, nameOf: (id: string) => string, currency?: string): string {
    if (value === null || value === undefined) {
        if (field === "max_occurrences") return "no limit";
        return "none";
    }
    switch (field) {
        case "amount":
            return money(value, currency);
        case "date":
        case "end_date":
            return formatDateOnly(value as string, { month: "short", day: "numeric", year: "numeric" });
        case "paid_by":
            return nameOf(String(value));
        case "on_hold":
            return value ? "on hold" : "active";
        case "active":
            return value ? "running" : "paused";
        case "secondary_currencies":
            return Array.isArray(value) && value.length > 0 ? value.join(", ") : "none";
        case "splits":
            if (!Array.isArray(value)) return String(value);
            return value
                .map((s: any) => {
                    const share = typeof s.percentage === "number" ? `${s.percentage}%` : money(s.amount_owed, currency);
                    return share ? `${nameOf(s.user_id)} ${share}` : nameOf(s.user_id);
                })
                .join(", ");
        default:
            return String(value);
    }
}

export function describeChange(change: XenSplitLogChange, nameOf: (id: string) => string, currency?: string): string {
    const label = FIELD_LABELS[change.field] ?? change.field;
    // Notes can be long - say they changed rather than quoting both versions
    if (change.field === "notes") return change.to ? `${label} changed` : `${label} removed`;
    return `${label}: ${formatValue(change.field, change.from, nameOf, currency)} → ${formatValue(change.field, change.to, nameOf, currency)}`;
}

const quoted = (s?: string) => (s ? `"${s}"` : "an expense");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeLogEntry(entry: XenSplitLogEntry, nameOf: (id: string) => string): DescribedLogEntry {
    const m = entry.meta ?? {};
    const actor = entry.actor_id ? nameOf(entry.actor_id) : "Recurring schedule";
    const amt = money(m.amount, m.currency);
    const withAmt = (s: string) => (amt ? `${s} (${amt})` : s);
    const settlement = () => `${nameOf(m.from)} paid ${nameOf(m.to)} ${amt}`.trim();
    const exchange = () =>
        `${nameOf(m.party_a)} ${money(m.amount_a, m.currency_a)} ⇄ ${nameOf(m.party_b)} ${money(m.amount_b, m.currency_b)}`;

    let text: string;
    switch (entry.action) {
        case "group_created": text = `created the group ${entry.summary ? `"${entry.summary}"` : ""}`.trim(); break;
        case "group_updated": text = "updated the group settings"; break;
        case "group_image_updated": text = "changed the group image"; break;
        case "ownership_transferred":
            text = m.automatic
                ? `handed ownership to ${nameOf(m.to)} by leaving`
                : `transferred ownership to ${nameOf(m.to)}`;
            break;
        case "member_added": text = `added ${nameOf(m.user_id)}`; break;
        case "member_removed": text = m.left ? "left the group" : `removed ${nameOf(m.user_id)}`; break;
        case "expense_created":
            text = withAmt(`added ${quoted(entry.summary)}`) + (m.frequency ? `, repeating ${m.frequency}` : "");
            break;
        case "expense_updated": text = `edited ${quoted(entry.summary)}`; break;
        case "expense_deleted": text = withAmt(`deleted ${quoted(entry.summary)}`); break;
        case "expense_restored": text = withAmt(`restored ${quoted(entry.summary)}`); break;
        case "expense_images_added":
            text = `added ${plural(Number(m.count) || 1, "receipt image")} to ${quoted(entry.summary)}`;
            break;
        case "expense_image_removed": text = `removed a receipt image from ${quoted(entry.summary)}`; break;
        case "recurring_scheduled":
            text = withAmt(`scheduled ${quoted(entry.summary)} to repeat ${m.frequency ?? ""}`.trim())
                + (m.start_date ? `, starting ${formatValue("date", m.start_date, nameOf)}` : "");
            break;
        case "recurring_generated":
            text = `added ${plural(Number(m.count) || 1, "occurrence")} of ${quoted(entry.summary)}`;
            break;
        case "recurring_cancelled": text = `stopped ${quoted(entry.summary)} from repeating`; break;
        case "recurring_paused": text = `paused the schedule for ${quoted(entry.summary)}`; break;
        case "recurring_resumed": text = `resumed the schedule for ${quoted(entry.summary)}`; break;
        case "recurring_updated": text = `changed the schedule for ${quoted(entry.summary)}`; break;
        case "settlement_created": text = `recorded a settlement: ${settlement()}`; break;
        case "settlement_deleted": text = `undid a settlement: ${settlement()}`; break;
        case "settlement_restored": text = `restored a settlement: ${settlement()}`; break;
        case "exchange_created": text = `recorded an exchange: ${exchange()}`; break;
        case "exchange_deleted": text = `deleted an exchange: ${exchange()}`; break;
        case "exchange_restored": text = `restored an exchange: ${exchange()}`; break;
        default: text = String(entry.action).replace(/_/g, " ");
    }

    // The pause/resume row already says what happened to the schedule; don't repeat it
    const changes = entry.changes.filter((c) => !(c.field === "active" && (entry.action === "recurring_paused" || entry.action === "recurring_resumed")));
    return { actor, text, details: changes.map((c) => describeChange(c, nameOf, m.currency)) };
}
