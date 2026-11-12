/** Escape a string so it matches literally inside a RegExp or a Mongo `$regex`. */
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
