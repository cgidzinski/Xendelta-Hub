import type { XenBudgetLabel, XenBudgetMember } from "../../../../../hooks/xenbudget/types";
import { chartColorAt, MAGNITUDE_COLOR } from "../../../../../components/ui/chartColors";
import { resolveLabelColor } from "../LabelChip";

/**
 * The hue for a budget's bar.
 *
 * One category has a colour of its own worth carrying onto the bar - it ties the bar to
 * the chip above it. Several categories, or none, have no single colour to claim, so
 * those fall back to the magnitude hue rather than picking one category's arbitrarily.
 */
export function scopeColor(categories: string[], registry: XenBudgetLabel[]): string {
    return categories.length === 1 ? resolveLabelColor(categories[0], registry) : MAGNITUDE_COLOR;
}

/**
 * A member's colour, taken from their POSITION in the book rather than a hash of their
 * name. Two members of one book can then never collide, which a hash cannot promise - and
 * a book has far fewer members than the palette has entries.
 *
 * Someone who has left the book (a budget can outlive their membership) has no position,
 * so they get the magnitude hue instead of colouring by accident.
 */
export function memberColor(userId: string, members: XenBudgetMember[]): string {
    const index = members.findIndex((m) => m.user_id === userId);
    return index === -1 ? MAGNITUDE_COLOR : chartColorAt(index);
}
