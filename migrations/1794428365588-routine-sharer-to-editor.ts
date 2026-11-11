// XenRoutine members used the role "sharer"; every sharing-capable sub-app now uses the same
// owner / editor / viewer roles (see src/server/utils/membership.ts). "sharer" meant "may complete
// and postpone, not change settings", which is exactly "editor" for a routine.
//
// Old code keeps working while this runs: it only ever compared roles against "owner".
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  await connection
    .collection("xenroutines")
    .updateMany(
      { "members.role": "sharer" },
      { $set: { "members.$[m].role": "editor" } },
      { arrayFilters: [{ "m.role": "sharer" }] },
    );
}

export async function down(connection: Connection): Promise<void> {
  // Every non-owner member of a routine was a sharer before, so this is exact.
  await connection
    .collection("xenroutines")
    .updateMany(
      { "members.role": "editor" },
      { $set: { "members.$[m].role": "sharer" } },
      { arrayFilters: [{ "m.role": "editor" }] },
    );
}
