// Adds `roster: [{ user_id, role, added_at }]` to every XenSplit group: the creator is the owner and
// every other member an editor (the same rule the app has always applied). The original `members`
// and `created_by` fields are untouched and stay authoritative until a later release, so code that
// does not know about `roster` keeps working while this runs.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  const groups = connection.collection("xensplits");
  const now = new Date();
  const cursor = groups.find({}, { projection: { members: 1, created_by: 1, roster: 1 } });
  for await (const g of cursor) {
    const ids = [...new Set<string>((g.members ?? []).map((m: unknown) => String(m)))];
    const roster = ids.map((user_id) => ({
      user_id,
      role: user_id === g.created_by ? "owner" : "editor",
      added_at: now,
    }));
    await groups.updateOne({ _id: g._id }, { $set: { roster } });
  }
  await groups.createIndex({ "roster.user_id": 1 });
}

export async function down(connection: Connection): Promise<void> {
  const groups = connection.collection("xensplits");
  await groups.updateMany({}, { $unset: { roster: "" } });
  await groups.dropIndex("roster.user_id_1").catch(() => undefined);
}
