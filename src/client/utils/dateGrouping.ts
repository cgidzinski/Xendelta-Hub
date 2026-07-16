export interface DayGroup<T> {
    key: string;
    label: string;
    items: T[];
}

/** Groups an already date-desc sorted list into ordered day-groups with display labels. */
export function groupByDay<T>(items: T[], getDate: (item: T) => string | Date): DayGroup<T>[] {
    const groups: DayGroup<T>[] = [];
    for (const item of items) {
        const d = new Date(getDate(item));
        const key = d.toDateString();
        const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.items.push(item);
        else groups.push({ key, label, items: [item] });
    }
    return groups;
}
