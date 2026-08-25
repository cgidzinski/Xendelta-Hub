export interface DayGroup<T> {
    key: string;
    label: string;
    items: T[];
}

function partNumber(parts: Array<{ type: string; value: string }>, type: string): number {
    return Number(parts.find((p) => p.type === type)?.value ?? 0);
}

/**
 * Formats an item date. Item dates are date-only values stored at UTC midnight, so they
 * are formatted in UTC — a viewer's own zone would shift the calendar day for anyone
 * west of UTC (e.g. July 1 showing as June 30).
 */
export function formatDateOnly(
    value: string | Date,
    options: Intl.DateTimeFormatOptions = {},
): string {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(value));
}

/** A Date whose local Y/M/D equal the date-only value — what a local-time date picker
 *  should show so it edits that day rather than the viewer's shifted one. */
export function dateOnlyToLocal(value: string | Date): Date {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "UTC",
        year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(value));
    return new Date(partNumber(parts, "year"), partNumber(parts, "month") - 1, partNumber(parts, "day"));
}

/** Groups an already date-desc sorted list into ordered day-groups with display labels. */
export function groupByDay<T>(
    items: T[],
    getDate: (item: T) => string | Date,
    timeZone?: string,
): DayGroup<T>[] {
    const groups: DayGroup<T>[] = [];
    for (const item of items) {
        const d = new Date(getDate(item));
        const key = timeZone
            ? new Intl.DateTimeFormat("en-CA", {
                timeZone, year: "numeric", month: "2-digit", day: "2-digit",
            }).format(d)
            : d.toDateString();
        const label = timeZone
            ? new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d)
            : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.items.push(item);
        else groups.push({ key, label, items: [item] });
    }
    return groups;
}
