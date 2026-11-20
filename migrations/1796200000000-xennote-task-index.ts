import type { Connection } from "mongoose";
import { deriveTasks } from "../src/shared/xennote/tasks";

/** Backfill the per-page task index from bodies written before the tasks view existed. */
export async function up(connection: Connection) {
  const pages = connection.collection("xennotepages");
  for await (const body of connection
    .collection("xennotepagebodies")
    .find({}, { projection: { page_id: 1, doc: 1, rev: 1 } })) {
    // A save racing the backfill has already computed the index from its newer revision.
    await pages.updateOne(
      { _id: body.page_id, rev: body.rev, task_items: { $exists: false } },
      { $set: { task_items: deriveTasks(body.doc) } },
    );
  }
}

export async function down(connection: Connection) {
  await connection
    .collection("xennotepages")
    .updateMany({ task_items: { $exists: true } }, { $unset: { task_items: "" } });
}
