import type { Cosmetics } from "@shared/cosmetics";
// What other people may see of a user. Every query that loads someone for another person's screen selects these
// fields (and nothing like email, roles, gems or inventory). A cosmetic worn by someone shows wherever they appear,
// so adding a field here is how it reaches XenSplit, XenBudget, Messages and the rest at once.
export const PUBLIC_USER_FIELDS = "username avatar cosmetics";

/** Mongoose `select` string for populated users, plus any extra fields a caller needs. */
export const publicUserFields = (...extra: string[]): string => [PUBLIC_USER_FIELDS, ...extra].join(" ");

/** What someone wears, for a wire shape: just the slots they fill, or undefined (omitted from the JSON) if none. */
export function cosmeticsOf(user: any): Cosmetics | undefined {
  const badge = user?.cosmetics?.badge;
  return badge ? { badge } : undefined;
}
