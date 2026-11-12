// App photos became XenDrive files (#232). Until now a photo on an XenSplit expense, a XenBudget item, a XenNote note
// or a XenKitchen item was only an object in cloud storage that no storage count ever saw. This migration gives each
// existing photo a XenDriveFile record tagged `source: { app, ref }` and links the photo to it (`file_id`):
//   - XenSplit  ref = the group        owner = the group's creator
//   - XenBudget ref = the book         owner = the book's creator
//   - XenNote   ref = the note         owner = the note's owner
//   - XenKitchen ref = the item        owner = the item's creator, else its book's owner
// Nobody recorded who uploaded a photo, so the owner stands in for the uploader.
//
// Every record is `counted: false`: for now only files uploaded straight to XenDrive, and chat attachments, count toward
// storage, so nobody's usage changes. Chat attachments need nothing here: they already count.
//
// XenKitchen photos lived in the PUBLIC bucket. Each is copied into the private bucket first; only once its record is
// saved and the item points at it is the public original deleted, so a failed run loses nothing and can be re-run.
// The other apps' photos stay where they are: the new record's `storage_path` is the old path.
import crypto from "crypto";
import { Types, type Connection } from "mongoose";
import { privateBucket, publicBucket } from "../src/server/config/gcs";

type Row = Record<string, any>;

const isOid = (id: unknown) => typeof id === "string" && Types.ObjectId.isValid(id);

/** Create the tagged file for this stored object, or return the one a previous run already made for it. */
async function fileFor(
  connection: Connection,
  doc: { owner: string; app: string; ref: string; name: string; storagePath: string; mimeType: string; size: number },
): Promise<Types.ObjectId> {
  const files = connection.collection("xendrivefiles");
  const saved = await files.findOneAndUpdate(
    { storage_path: doc.storagePath },
    {
      $setOnInsert: {
        owner_id: new Types.ObjectId(doc.owner),
        folder_id: null,
        name: doc.name,
        storage_path: doc.storagePath,
        mimeType: doc.mimeType,
        size: doc.size,
        createdAt: new Date(),
        shareEnabled: false,
        shareToken: crypto.randomBytes(16).toString("hex"),
        source: { app: doc.app, ref: doc.ref },
        counted: false,
        __v: 0,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  return saved!._id;
}

/** Size and type of a stored object, or null if it is gone (its photo is already broken; leave it be). */
async function inspect(bucket: typeof privateBucket, path: string) {
  try {
    const [metadata] = await bucket.file(path).getMetadata();
    return {
      size: parseInt(String(metadata.size ?? "0"), 10),
      mimeType: String(metadata.contentType || "application/octet-stream"),
    };
  } catch {
    return null;
  }
}

const baseName = (path: string) => path.split("/").pop() || "photo";

/** One photo of a document, and how to address it in an update (`prefix` is its path, `filters` the array filters). */
interface PhotoRef {
  image: Row;
  prefix: string;
  filters: Row[];
}

const topLevel = (doc: Row): PhotoRef[] =>
  (doc.images ?? []).map((image: Row) => ({
    image,
    prefix: "images.$[i]",
    filters: [{ "i._id": image._id }],
  }));

/** XenSplit expense photos, XenBudget item photos and XenNote photos: tag them where they already are. */
async function tagInPlace(
  connection: Connection,
  opts: {
    collection: string;
    app: string;
    filter: Row;
    /** Who stands in for the uploader. `owners` is loaded once, for owners that live on another collection. */
    owners?: () => Promise<Map<string, string>>;
    ownerOf: (doc: Row, owners: Map<string, string>) => string | null | undefined;
    ref: (doc: Row) => string;
    photos: (doc: Row) => PhotoRef[];
  },
): Promise<{ tagged: number; missing: number }> {
  const collection = connection.collection(opts.collection);
  const owners = opts.owners ? await opts.owners() : new Map<string, string>();
  let tagged = 0;
  let missing = 0;
  for await (const doc of collection.find(opts.filter)) {
    const owner = opts.ownerOf(doc, owners);
    if (!owner || !isOid(owner)) continue;
    for (const { image, prefix, filters } of opts.photos(doc)) {
      if (image.file_id || !image.gcs_path) continue;
      const info = await inspect(privateBucket, image.gcs_path);
      if (!info) {
        missing += 1;
        continue;
      }
      const fileId = await fileFor(connection, {
        owner,
        app: opts.app,
        ref: opts.ref(doc),
        name: baseName(image.gcs_path),
        storagePath: image.gcs_path,
        mimeType: info.mimeType,
        size: info.size,
      });
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: { [`${prefix}.file_id`]: fileId, [`${prefix}.uploaded_by`]: owner },
          $unset: { [`${prefix}.gcs_path`]: "" },
        },
        { arrayFilters: filters },
      );
      tagged += 1;
    }
  }
  return { tagged, missing };
}

export async function up(connection: Connection): Promise<void> {
  const log = (what: string, r: { tagged: number; missing: number }) =>
    console.log(`>>> app photos: ${what}: ${r.tagged} tagged, ${r.missing} missing from storage (left as they were)`);

  // XenSplit: photos sit on the expenses of a group; the owner is the group's creator.
  log(
    "XenSplit",
    await tagInPlace(connection, {
      collection: "xensplits",
      app: "xensplit",
      filter: { "expenses.images.gcs_path": { $exists: true } },
      ownerOf: (group) => group.created_by,
      ref: (group) => String(group._id),
      photos: (group) =>
        (group.expenses ?? []).flatMap((expense: Row) =>
          (expense.images ?? []).map((image: Row) => ({
            image,
            prefix: "expenses.$[e].images.$[i]",
            filters: [{ "e._id": expense._id }, { "i._id": image._id }],
          })),
        ),
    }),
  );

  // XenBudget: photos sit on items; the owner is the book's creator.
  log(
    "XenBudget",
    await tagInPlace(connection, {
      collection: "xenbudgetitems",
      app: "xenbudget",
      filter: { "images.gcs_path": { $exists: true } },
      owners: async () =>
        new Map(
          (
            await connection
              .collection("xenbudgetbooks")
              .find({}, { projection: { created_by: 1 } })
              .toArray()
          ).map((book) => [String(book._id), String(book.created_by)]),
        ),
      ownerOf: (item, owners) => owners.get(String(item.book_id)) ?? item.created_by,
      ref: (item) => String(item.book_id),
      photos: topLevel,
    }),
  );

  // XenNote: photos sit on notes; the owner is the note's owner.
  log(
    "XenNote",
    await tagInPlace(connection, {
      collection: "xennotes",
      app: "xennote",
      filter: { "images.gcs_path": { $exists: true } },
      ownerOf: (note) => note.owner_id,
      ref: (note) => String(note._id),
      photos: topLevel,
    }),
  );

  // XenKitchen: public bucket -> private bucket, then the item points at the copy, then the original goes.
  const items = connection.collection("xenkitchenitems");
  const books = new Map(
    (
      await connection
        .collection("xenkitchenbooks")
        .find({}, { projection: { members: 1 } })
        .toArray()
    ).map((b) => [
      String(b._id),
      (b.members ?? []).find((m: Row) => m.role === "owner")?.user_id as string | undefined,
    ]),
  );
  let moved = 0;
  let gone = 0;
  for await (const item of items.find({ "images.gcs_path": { $exists: true } })) {
    const owner = item.created_by || books.get(String(item.book_id));
    if (!owner || !isOid(owner)) continue;
    for (const image of item.images ?? []) {
      if (image.file_id || !image.gcs_path) continue;
      const info = await inspect(publicBucket, image.gcs_path);
      if (!info) {
        gone += 1;
        continue;
      }
      // A fixed destination, so a re-run after a crash finds the copy it already made instead of making another.
      const extension = baseName(image.gcs_path).split(".").pop() || "webp";
      const dest = `xendrive/${owner}/kitchen-${String(image._id)}.${extension}`;
      await publicBucket.file(image.gcs_path).copy(privateBucket.file(dest));
      const fileId = await fileFor(connection, {
        owner,
        app: "xenkitchen",
        ref: String(item._id),
        name: baseName(image.gcs_path),
        storagePath: dest,
        mimeType: info.mimeType,
        size: info.size,
      });
      await items.updateOne(
        { _id: item._id },
        {
          $set: { "images.$[i].file_id": fileId, "images.$[i].uploaded_by": owner },
          $unset: { "images.$[i].gcs_path": "", "images.$[i].url": "" },
        },
        { arrayFilters: [{ "i._id": image._id }] },
      );
      await publicBucket
        .file(image.gcs_path)
        .delete()
        .catch(() => undefined);
      moved += 1;
    }
  }
  console.log(`>>> app photos: XenKitchen: ${moved} moved to private storage, ${gone} missing (left as they were)`);
}

export async function down(connection: Connection): Promise<void> {
  const files = connection.collection("xendrivefiles");
  const tagged = (app: string) => files.find({ "source.app": app, counted: false });

  // Photos kept their stored object (XenSplit, XenBudget, XenNote): put the path back and drop the record.
  for (const [collection, app] of [
    ["xensplits", "xensplit"],
    ["xenbudgetitems", "xenbudget"],
    ["xennotes", "xennote"],
  ] as const) {
    const target = connection.collection(collection);
    for await (const file of tagged(app)) {
      const id = file._id as Types.ObjectId;
      if (collection === "xensplits") {
        await target.updateMany(
          { "expenses.images.file_id": id },
          {
            $set: { "expenses.$[].images.$[i].gcs_path": file.storage_path },
            $unset: { "expenses.$[].images.$[i].file_id": "" },
          },
          { arrayFilters: [{ "i.file_id": id }] },
        );
      } else {
        await target.updateMany(
          { "images.file_id": id },
          { $set: { "images.$[i].gcs_path": file.storage_path }, $unset: { "images.$[i].file_id": "" } },
          { arrayFilters: [{ "i.file_id": id }] },
        );
      }
      await files.deleteOne({ _id: file._id });
    }
  }

  // XenKitchen photos were copied to private storage; copy them back to the public bucket for the old `url`.
  const items = connection.collection("xenkitchenitems");
  for await (const file of tagged("xenkitchen")) {
    const id = file._id as Types.ObjectId;
    const name = `xenkitchen/${file.source.ref}/${baseName(file.storage_path)}`;
    await privateBucket.file(file.storage_path).copy(publicBucket.file(name));
    await items.updateMany(
      { "images.file_id": id },
      {
        $set: {
          "images.$[i].gcs_path": name,
          "images.$[i].url": `https://storage.googleapis.com/${publicBucket.name}/${name}`,
        },
        $unset: { "images.$[i].file_id": "" },
      },
      { arrayFilters: [{ "i.file_id": id }] },
    );
    await privateBucket
      .file(file.storage_path)
      .delete()
      .catch(() => undefined);
    await files.deleteOne({ _id: id });
  }
}
