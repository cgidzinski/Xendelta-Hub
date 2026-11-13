# Where uploads live, and what counts toward storage

Every file a person uploads is a `XenDriveFile` owned by them, in the private bucket. Files uploaded straight to XenDrive
**count toward the person's storage**, and so do chat attachments. Files the other apps store for them (photos) are tagged
with where they came from and are **exempt from the quota for now** (`counted: false`). `usageFor` and `checkQuota`
(`src/server/utils/xendriveUtils.ts`) only add up files that count (`counted` not `false`).

| Where | Stored as | Bucket | Limit today | Counts? |
|---|---|---|---|---|
| **XenDrive** uploads | `XenDriveFile`, `checkQuota` | private | the person's quota | **yes** |
| Chat attachments | tagged file, `source: { app: "chat", ref: conversationId }` | private | the person's quota | **yes** |
| XenSplit expense photos | tagged file, `ref` = group id | private | 10 MB each, 10 per expense | no |
| XenBudget item photos | tagged file, `ref` = book id | private | 10 MB each, 10 per item | no |
| XenNote photos | tagged file, `ref` = note id | private | 15 MB each (resized), 10 per note | no |
| XenRoutine "done" photos | tagged file, `ref` = routine id, on a history entry | private | 15 MB each (resized), 5 per "done" | no |
| XenKitchen photos | tagged file, `ref` = item id | private (was public) | 15 MB each (resized), 10 per item | no |
| XenSplit group image | `mediaUtils.uploadXenSplitGroupImageFile` | public | resized, one per group | exempt |
| Avatars | `mediaUtils.uploadAvatarFile` | public | 5 MB, resized, one per person | exempt |
| Blog assets (admin) | `mediaUtils.uploadBlogAsset` | public | `MAX_BLOG_ASSET_SIZE`, admins only | exempt |
| Recipaint assets | `mediaUtils.uploadRecipaintAsset` (+ thumbnail) | public | 10 MB each, no count cap | exempt, **open item** |

**Open item: Recipaint assets.** Any signed-in user can upload any number of 10 MB images to the public bucket, and they
aren't resized. They stay outside XenDrive for now. Cap how many a recipe can hold, or resize them, before this grows.

**The rule to switch on later.** Today the photo apps' files are tagged but not counted. The intended rule once counting is
switched on: files in a **shared space** (a XenSplit group, or a XenBudget book, XenNote notebook or XenKitchen book with
more than one member) stay exempt, and files in a space only the owner uses count. It is one function per app:
`DriveSourceApp.counts(ref)` in `utils/driveSources.ts`. Files already stored have their `counted` flag set when they are
created, so switching the rule on also needs a migration that re-evaluates the existing ones.

Per-file size limits (multer, `src/server/config/multer.ts`) and per-item photo counts stay as they are; with no quota
in force for apps, they are what bounds an item.

## How an app stores files in XenDrive (built for chat attachments, #175)
A chat upload is a real `XenDriveFile` owned by the sender with `source: { app: "chat", ref: <conversationId> }` and no
folder. The pieces:

- **`utils/driveSources.ts`** is the registry. An app calls `registerDriveSource(app, { label, verify, describe })` once
  (chat does it in `chat/service.ts`): `verify` says whether a person may store files for a `ref` (chat: they are a
  member), `describe` names each `ref` for the person ("Weekend trip"). XenDrive never learns what a chat is.
- **Uploading** uses the ordinary chunked flow. `POST /api/xendrive/initiate` takes an optional `source`; it is checked with
  `assertDriveSource` and refused together with a folder. The quota check runs only if the source says its files count. The upload session
  carries the tag to the finished file. On the client, `uploadOne({ file, source })`.
- **The drive's own lists.** `driveOnly` is merged into My Drive and folder contents, search, recent, shared, and the overview,
  so tagged files stay out of them. A tagged file can't be renamed or given a public link from XenDrive (`assertNotAppFile`);
  it can be deleted, which deletes the stored bytes.
- **XenDrive > From apps** (`GET /api/xendrive/app-files`) lists them grouped by app and then by `ref`, with sizes, download,
  delete and "Delete all" per group, so people can free the space. The sidebar entry appears once there is anything to show
  (`appFiles` in `GET /api/xendrive/recent`). Index `{ owner_id, "source.app", createdAt }`.
- **Counting.** The finished file's `counted` flag comes from the source's `counts(ref)`. `usageFor` and `checkQuota` add up
  only files that count.
- **Choosing an existing XenDrive file** in an app attaches it by id: no copy, no extra storage, no tag.
- **Access for others.** The file stays private in the uploader's drive. Chat members download an attachment through
  `GET /api/chat/conversations/:id/messages/:seq/attachments/:fileId`, which checks membership and that the file is on that
  message, then signs a short-lived link.

## How the other apps use it (#232)
XenSplit, XenBudget, XenNote and XenKitchen store photos as tagged files through `utils/appFiles.ts`:

- `storeAppFiles(userId, { app, ref }, files)`: checks the person may store for that `ref` (`assertDriveSource`), checks the
  quota when the app says the files count, uploads to the private bucket, and creates the tagged files. All or nothing:
  if one upload or record fails, what was stored is removed.
- `copyAppFiles(userId, { app, ref }, origins)`: gives the person their own copy of each photo, copied inside storage.
  XenKitchen uses it when an item is duplicated, copied to another book or saved from a shared link. Every copy is its own
  file, so deleting one item never touches another's photos.
- `removeAppFiles(ids)`: deletes the files and their bytes. `signedUrlsFor(ids, minutes)`: short-lived links.
- Each app's source is registered next to its code (`utils/xensplitFiles.ts`, `xenBudgetFiles.ts`, `xenNoteFiles.ts`,
  `xenKitchenFiles.ts`). It says who may store files for a `ref`, names each `ref` for the person, whether the files count,
  and what to do when the person deletes a file from XenDrive (`onRemoved`: pull it off the expense, item or note).
- An image on an expense, item or note is `{ file_id, uploaded_by }`. `gcs_path` (and XenKitchen's `url`) are the old
  shape; the migration `1794700000000-app-photos-to-xendrive` links existing photos and removes them.
- A photo belongs to **whoever uploaded it**, not to the group, book or notebook. Leaving a shared space keeps the person's
  photos in their XenDrive (listed under From apps as "A group you're no longer in") until they delete them, and deleting one
  removes it from the space. Deleting the expense's group, the item, the note or the book deletes the photos too.
- The ref is the thing the photo is on, so "Delete all" in From apps means something: the group for XenSplit and the book for
  XenBudget; the note for XenNote and the item for XenKitchen, because those can move between notebooks and books.

**Visibility.** Tagged files are hidden from My Drive, folders, search and recent, so a person sees only what they uploaded to
XenDrive. They are listed under From apps, and a hidden "More filters" control on My Drive reveals them in the drive's lists:
`GET /api/xendrive/browse?source=` takes `all` (everything), `uncounted` (files outside the quota) or one app's key
(`driveListFilter` in `utils/driveSources.ts`). The control only appears once the person has any app files. Revealed files are
marked "From <app>" and, for the photo apps, "Doesn't count toward storage".

**The migration** tags every existing photo for its owner (the group, book or note owner; XenKitchen's item creator): nobody
recorded who uploaded a photo. Records are `counted: false`, so nobody's usage changes. XenSplit, XenBudget and XenNote photos
stay where they are (the record's `storage_path` is the old path). XenKitchen photos are copied from the public bucket to the
private one; the public original is deleted only after the item points at the copy. Rehearse it on a restored copy
(`migrations/README.md`).

It ties to the ongoing-cost plan in `docs/monetization.md` ("Gems to keep files stored or shared"): once counting is on, the
quota is what gems extend.

## Share links: passwords, expiry and download counts
- A file's own link and a folder's link can each have a **password** and an **expiry**. Passwords are bcrypt hashes
  (`utils/sharePasswords.ts`): the owner can set, replace or remove one but never read it back, and no API returns it
  (`hasPassword` only). A visitor sends it as `?password=`, for a file (`/api/xendrive/download/:token`) and for a folder
  (`/api/xendrive/public/folder/:token`, and its `/files/:fileId`).
- A folder link answers a wrong or missing password with **403**, never 401: the client treats any 401 as an expired
  sign-in and clears the token, which would sign the owner out when they open their own link in the same browser.
  `GET /api/xendrive/public/folder/:token/info` tells a visitor whether a password is needed without failing.
- A folder link's password, expiry and tally live under `share` on the folder and survive turning the link off and on, and
  replacing it. A file inside a shared folder is still served with the folder's password only, not its own.
- Every public download counts (`downloads`, `lastDownloadedAt` on the file; `share.downloads` and
  `share.lastDownloadedAt` on the folder for downloads made through its link). Only a download that is actually sent
  counts, not one refused for a password or expiry.
- `XenDriveFile.password` is the old plain-text field. It is kept in the schema only so a link keeps its password in the
  moments between a deploy and `migrations/1794900000000-xendrive-password-hash.ts`, which hashes it and removes it. The
  migration can't be reversed; restore from a backup to go back.

