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

## How an app stores files in XenDrive (built for chat attachments, #175)
A chat upload is a real `XenDriveFile` owned by the sender with `source: { app: "chat", ref: <conversationId> }` and no
folder. The pieces:

- **`utils/driveSources.ts`** is the registry. An app calls `registerDriveSource(app, { label, verify, describe })` once
  (chat does it in `chat/service.ts`): `verify` says whether a person may store files for a `ref` (chat: they are a
  member), `describe` names each `ref` for the person ("Weekend trip"). XenDrive never learns what a chat is.
- **Uploading** uses the ordinary chunked flow. `POST /api/xendrive/initiate` takes an optional `source`; it is checked with
  `assertDriveSource`, refused together with a folder, and checked against the quota like any upload. The upload session
  carries the tag to the finished file. On the client, `uploadOne({ file, source })`.
- **Hidden from the drive's own lists.** `driveOnly = { "source.app": { $exists: false } }` is merged into My Drive and folder
  contents, search, recent, shared, and the overview. A tagged file also can't be renamed or given a public link from XenDrive
  (`assertNotAppFile`); it can be deleted, which deletes the stored bytes.
- **XenDrive > From apps** (`GET /api/xendrive/app-files`) lists them grouped by app and then by `ref`, with sizes, download,
  delete and "Delete all" per group, so people can free the space. The sidebar entry appears once there is anything to show
  (`appFiles` in `GET /api/xendrive/recent`). Index `{ owner_id, "source.app", createdAt }`.
- **They count toward the quota.** `usageFor` and `checkQuota` don't filter on `source`.
- **Choosing an existing XenDrive file** in an app attaches it by id: no copy, no extra storage, no tag.
- **Access for others.** The file stays private in the uploader's drive. Chat members download an attachment through
  `GET /api/chat/conversations/:id/messages/:seq/attachments/:fileId`, which checks membership and that the file is on that
  message, then signs a short-lived link.

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
