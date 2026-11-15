// Files are kept in one folder per app and space, so the bucket can be audited by folder (docs/storage.md):
//   xendrive/<userId>/<name>  uploaded straight to XenDrive
//   <app>/<ref>/<name>        stored by an app (chat/<conversationId>, xensplit/<groupId>, xenkitchen/<itemId>, ...)
// App files used to be saved under the uploader's xendrive/ folder, and older photos under xensplit-images/ and
// xenbudget-images/. Each one is copied to its folder, its record points at the copy, then the old object is deleted.
//
// `up` is repeatable: files already in their folder are skipped, and a copy left by an interrupted run is reused. A file
// whose object is missing is logged and left alone. `down` doesn't move anything back: the old paths were arbitrary.
import type { Connection } from "mongoose";
import { privateStore } from "../src/server/storage";

const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const baseName = (path: string) => path.split("/").pop() || path;

export async function up(connection: Connection): Promise<void> {
  const files = connection.collection("xendrivefiles");
  let moved = 0;
  let missing = 0;
  for await (const file of files.find(
    { "source.app": { $exists: true } },
    { projection: { storage_path: 1, source: 1 } },
  )) {
    const { app, ref } = file.source ?? {};
    if (!SAFE.test(String(app)) || !SAFE.test(String(ref))) continue;
    const target = `${app}/${ref}/${baseName(file.storage_path)}`;
    if (file.storage_path === target) continue;
    if (!(await privateStore.exists(target))) {
      if (!(await privateStore.exists(file.storage_path))) {
        missing += 1;
        console.warn(`storage-folders: object missing for file ${file._id} (${file.storage_path}); left as is`);
        continue;
      }
      await privateStore.copyFrom(privateStore, file.storage_path, target);
    }
    await files.updateOne({ _id: file._id }, { $set: { storage_path: target } });
    await privateStore.delete(file.storage_path).catch(() => undefined);
    moved += 1;
  }
  console.log(`storage-folders: moved ${moved} files${missing ? `, ${missing} missing` : ""}`);
}

export async function down(): Promise<void> {
  throw new Error("irreversible: files stay in their app folders (the old paths carried no meaning)");
}
