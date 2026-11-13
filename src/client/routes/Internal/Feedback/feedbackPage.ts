/** The page "Send feedback" was opened from (`?from=`), if it is one of ours. Anything else is ignored. */
export function pageFromParam(raw: string | null): string | undefined {
  if (!raw || raw.length > 300) return undefined;
  return /^\/(internal|admin)(\/|\?|$)/.test(raw) && !raw.startsWith("/internal/feedback") ? raw : undefined;
}
