// One FileRecord for every stored file (models/fileRecord.ts, #380, docs/storage.md).
//
//   private: each XenDrive file gets a record that REUSES its _id (so every photo and chat attachment that points at the
//            file points at the record too). Files uploaded straight to XenDrive also point at it (`file`). Payer: the owner.
//   public:  records are backfilled from the links documents hold: avatars and XenSplit group pictures (house), blog
//            images (house), custom emoji (the person who added it) and Recipaint images (the recipe's author, with the
//            thumbnail beside them). Size and type come from the bucket; an object that isn't there is skipped.
//
// `up` is repeatable: records are upserted, and one that exists is left as it is. `down` removes every record and the
// `file` links (the XenDrive files themselves are untouched). Rehearse on a restored copy (migrations/README.md).
import type { Connection } from "mongoose";
import { publicKeyFromUrl, publicStore } from "../src/server/storage";
import { RECIPAINT_ASSET_FOLDER, thumbGcsPathFor } from "../src/shared/recipaint/assetUrls";

type Payer = { type: "user" | "community" | "house"; id?: string };

const URL_IN_TEXT = /https?:\/\/[^\s"'()<>\]]+/g;

export async function up(connection: Connection): Promise<void> {
  const records = connection.collection("filerecords");
  const files = connection.collection("xendrivefiles");

  // --- Private: one record per XenDrive file, same _id.
  let privateCount = 0;
  for await (const f of files.find({})) {
    const source = f.source?.app ? { app: String(f.source.app), ref: String(f.source.ref ?? "") } : null;
    await records.updateOne(
      { _id: f._id },
      {
        $setOnInsert: {
          bucket: "private",
          key: f.storage_path,
          size: f.size ?? 0,
          mimeType: f.mimeType || "application/octet-stream",
          name: f.name || "",
          uploadedBy: f.owner_id,
          createdAt: f.createdAt ?? new Date(),
          payer: { type: "user", id: String(f.owner_id) } satisfies Payer,
          space: source ?? { app: "xendrive", ref: String(f.owner_id) },
          ...(f.thumb?.path ? { thumbKey: f.thumb.path } : {}),
          ...(String(f.mimeType ?? "").startsWith("image/") && f.thumb?.path
            ? { previewKey: `previews/${f.storage_path}.webp` }
            : {}),
        },
      },
      { upsert: true },
    );
    if (!source) await files.updateOne({ _id: f._id, file: { $exists: false } }, { $set: { file: f._id } });
    privateCount += 1;
  }

  // --- Public: from the links documents hold.
  let publicCount = 0;
  let missing = 0;
  const claim = async (
    url: string | null | undefined,
    meta: {
      prefix: string;
      payer: Payer;
      app: string;
      ref?: string;
      uploadedBy?: unknown;
      thumbKey?: (key: string) => string;
    },
  ) => {
    const key =
      typeof url === "string" && url.includes("/") ? (url.startsWith("http") ? publicKeyFromUrl(url) : url) : null;
    if (!key || !key.startsWith(meta.prefix)) return;
    const info = await publicStore.head(key).catch(() => null);
    if (!info) {
      missing += 1;
      console.warn(`file-records: public object missing for ${key}; no record made`);
      return;
    }
    const thumbKey = meta.thumbKey?.(key);
    const hasThumb = thumbKey ? !!(await publicStore.head(thumbKey).catch(() => null)) : false;
    const res = await records.updateOne(
      { bucket: "public", key },
      {
        $setOnInsert: {
          size: info.size,
          mimeType: info.contentType || "application/octet-stream",
          name: key.split("/").pop() || key,
          ...(meta.uploadedBy ? { uploadedBy: meta.uploadedBy } : {}),
          createdAt: info.lastModified ?? new Date(),
          payer: meta.payer,
          space: { app: meta.app, ...(meta.ref ? { ref: meta.ref } : {}) },
          ...(hasThumb && thumbKey ? { thumbKey } : {}),
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) publicCount += 1;
  };

  for await (const u of connection.collection("users").find({}, { projection: { avatar: 1 } })) {
    await claim(u.avatar, { prefix: "avatar/", payer: { type: "house" }, app: "avatar", uploadedBy: u._id });
  }
  for await (const g of connection.collection("xensplits").find({}, { projection: { image_url: 1 } })) {
    await claim(g.image_url, {
      prefix: "xensplit-group-images/",
      payer: { type: "house" },
      app: "xensplit-group-images",
      ref: String(g._id),
    });
  }
  for await (const e of connection
    .collection("customemojis")
    .find({}, { projection: { storagePath: 1, createdBy: 1, communityId: 1, conversationId: 1 } })) {
    await claim(e.storagePath, {
      prefix: "emoji/",
      payer: e.createdBy ? { type: "user", id: String(e.createdBy) } : { type: "house" },
      app: "emoji",
      ref: String(e.communityId ?? e.conversationId ?? ""),
    });
  }
  for await (const r of connection
    .collection("recipes")
    .find({}, { projection: { author: 1, showcase: 1, steps: 1 } })) {
    const urls = [...(r.showcase ?? []), ...(r.steps ?? []).flatMap((s: { images?: string[] }) => s?.images ?? [])];
    for (const url of new Set<string>(urls)) {
      await claim(url, {
        prefix: `${RECIPAINT_ASSET_FOLDER}/`,
        payer: r.author ? { type: "user", id: String(r.author) } : { type: "house" },
        app: RECIPAINT_ASSET_FOLDER,
        uploadedBy: r.author,
        thumbKey: (key) => thumbGcsPathFor(key.slice(key.lastIndexOf("/") + 1)),
      });
    }
  }
  for await (const p of connection
    .collection("blogposts")
    .find({}, { projection: { assets: 1, featuredImage: 1, markdown: 1 } })) {
    const urls = new Set<string>([
      ...(p.assets ?? []),
      p.featuredImage,
      ...(String(p.markdown ?? "").match(URL_IN_TEXT) ?? []),
    ]);
    for (const url of urls) await claim(url, { prefix: "blog-assets/", payer: { type: "house" }, app: "blog-assets" });
  }

  console.log(
    `file-records: ${privateCount} private files, ${publicCount} new public records${missing ? `, ${missing} missing objects` : ""}`,
  );
}

export async function down(connection: Connection): Promise<void> {
  await connection.collection("filerecords").deleteMany({});
  await connection.collection("xendrivefiles").updateMany({ file: { $exists: true } }, { $unset: { file: "" } });
}
