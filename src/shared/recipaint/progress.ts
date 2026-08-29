// Paint-along progress is a list of step indexes. Indexes are positional, so anything the
// client sends has to be checked against the recipe as it exists now: the owner may have
// deleted or reordered steps since the client last loaded it.

/**
 * Keep only whole step indexes that exist on the recipe today, de-duplicated and ordered.
 *
 * This is a trust boundary, not a tidy-up: without the bound, a client could persist an
 * arbitrarily long array of arbitrary numbers against its own progress row.
 */
export function sanitizeCompletedSteps(completedSteps: unknown, stepCount: number): number[] {
  if (!Array.isArray(completedSteps)) return [];

  const valid = completedSteps.filter(
    (index): index is number =>
      typeof index === "number" && Number.isInteger(index) && index >= 0 && index < stepCount,
  );

  return [...new Set(valid)].sort((a, b) => a - b);
}
