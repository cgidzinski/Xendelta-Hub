// App pinning (no more limit, pinned from Home). Until now an empty `pinnedApps` meant "show XenSplit", so nobody could have
// no pinned apps. Now an unset `pinnedApps` means "never chosen" (the default pin) and an empty one means "chose none".
//
// Everyone who has an empty list today has never been able to choose it, and sees the default; unsetting those fields keeps
// exactly what they see. `up` is repeatable. `down` does nothing: an unset field and an empty one can't be told apart afterwards
// without losing who chose "none" since, and the app treats both safely.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  await connection.collection("users").updateMany({ pinnedApps: { $size: 0 } }, { $unset: { pinnedApps: "" } });
}

export async function down(): Promise<void> {
  // Intentionally empty (see above).
}
