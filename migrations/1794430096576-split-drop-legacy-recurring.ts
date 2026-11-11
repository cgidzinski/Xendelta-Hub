// XenSplit groups once embedded their recurring series in `recurring_expenses`; those moved to the
// ScheduledTask collection long ago and the model no longer declares the field. This removes the
// leftover empty arrays. A group that still holds a non-empty array is left alone (and counted),
// so nothing that might matter is ever deleted by this migration.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  const groups = connection.collection("xensplits");
  await groups.updateMany({ recurring_expenses: { $size: 0 } }, { $unset: { recurring_expenses: "" } });
  const left = await groups.countDocuments({ recurring_expenses: { $exists: true } });
  if (left > 0) console.warn(`>>> ${left} group(s) still hold a non-empty legacy recurring_expenses array; left as is`);
}

export async function down(): Promise<void> {
  // Nothing to restore: the field only ever held an empty array here, and the model no longer reads it.
}
