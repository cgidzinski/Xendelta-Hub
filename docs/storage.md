# Where uploads live, and what counts toward storage

**Only XenDrive files count toward a person's storage.** `usageFor` and `checkQuota`
(`src/server/utils/xendriveUtils.ts`) look at `XenDriveFile` and nothing else. Every other upload goes straight to
cloud storage through `uploadToGCS` (`src/server/utils/gcsUtils.ts`), capped only by multer's size limit per file
(`src/server/config/multer.ts`, `src/server/constants/index.ts`) and a cap per item. Those bytes cost money and
count for nobody.

| Where | Route / helper | Bucket | Limit today |
|---|---|---|---|
| XenSplit expense photos | `routes/xensplit.ts` → `uploadToGCS` | private | 10 MB each, 10 per expense |
| XenSplit group image | `mediaUtils.uploadXenSplitGroupImageFile` | public | resized |
| XenBudget item photos | `routes/xenbudget/items.ts` → `uploadToGCS` | private | 10 MB each, 10 per item |
| XenNote photos | `routes/xennote/images.ts` → `uploadToGCS` | private | 15 MB each (resized), 10 per note |
| XenKitchen photos | `routes/xenkitchen.ts` → `uploadToGCS` | private | 15 MB each (resized), 10 per item |
| Recipaint assets | `mediaUtils.uploadRecipaintAsset` (+ thumbnail) | public | `MAX_RECIPAINT_ASSET_SIZE` |
| Avatars | `mediaUtils.uploadAvatarFile` | public | 5 MB, resized |
| Blog assets (admin) | `mediaUtils.uploadBlogAsset` | public | `MAX_BLOG_ASSET_SIZE` |
| **XenDrive** | `routes/xendrive.ts`, chunked sessions | private | **counts: `checkQuota`** |

## Direction: tag the file with where it came from
Chat attachments (#175) are the first upload to follow the rule below. A chat upload is a real `XenDriveFile`
owned by the sender with `source: { app: "chat", ref: <conversationId> }` and no folder.

- **Tagged files are hidden from XenDrive's normal lists** (My Drive, folders, recent, shared, counts). A helper
  `driveOnly = { "source.app": { $exists: false } }` in `xendriveUtils.ts` is merged into each listing query.
- **They are listed under XenDrive › From apps › <App>**, grouped by `ref`, with sizes and bulk delete, so people can
  free up space. Index `{ owner_id: 1, "source.app": 1, createdAt: -1 }`.
- **They count toward the quota** (`usageFor` and `checkQuota` don't filter on `source`).
- Deleting a `XenDriveFile` through a query already deletes its bytes (the model's `deleteOne` hook).
- Choosing an existing XenDrive file in an app attaches it by id: no copy, no extra storage, and no tag.

## Fix later: make the other apps follow the rule
Store XenSplit, XenBudget, XenNote and XenKitchen photos as tagged `XenDriveFile`s (`source.app` = the app key),
through one helper that replaces the scattered `uploadToGCS` calls:

```ts
storeAppFile(userId, { app, ref }, file)   // runs checkQuota, uploads, creates the tagged XenDriveFile
```

- Avatars, group images, Recipaint assets and blog assets are small, resized or admin-only, and can stay exempt.
- It needs a migration that backfills `XenDriveFile` rows for photos that already exist. That turns existing photos
  into usage overnight, so tell people first, and rehearse it on a restored copy (`migrations/README.md`).
- Photos in a shared space (an expense in a group) are owned by whoever uploaded them. Decide whether leaving the
  group keeps them counting for the uploader.
- It ties to the ongoing-cost plan in `docs/monetization.md` ("Gems to keep files stored or shared").

Tracked in the follow-up issue "Count app uploads toward XenDrive storage".
