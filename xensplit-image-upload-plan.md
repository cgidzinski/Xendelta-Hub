# Xensplit Expense Image Upload Plan (Private Bucket)

TL;DR
- Add multi-image upload (max 5 images, 10MB each) for expenses. Images stored in the PRIVATE GCS bucket under `xensplit-images/${groupId}/${expenseId}/...`.
- DB stores only `gcs_path` for each image. Signed URLs are generated server-side on demand and returned by a new GET endpoint.
- Refactor Add/Edit expense UI into a 3-step Stepper (Details, Split, Photos). Edit step shows existing images with per-image delete. View modal shows thumbnail grid and an in-modal lightbox using signed URLs.

Decisions
- Max images per expense: 5
- Max file size: 10 MB per image
- Storage: Private GCS bucket; path pattern: `xensplit-images/${groupId}/${expenseId}/${uniqueFilename}`
- DB stores `gcs_path` only; signed URLs (15-min expiry) are generated via a server endpoint when needed
- Image deletion is immediate (per-image DELETE) while editing
- If image upload fails after creating an expense, the expense remains and images can be re-uploaded via Edit

Phase 1 — Server: Model & Infrastructure
1. `src/server/models/xenSplit.js`
   - Add `expenseImageSchema = new Schema({ gcs_path: String }, { _id: true })`
   - Add `images: [expenseImageSchema]` to `expenseSchema`
2. `src/server/constants/index.ts`
   - Add `MAX_XENSPLIT_IMAGE_SIZE = 10 * 1024 * 1024`
   - Add `MAX_XENSPLIT_IMAGES_PER_EXPENSE = 5`
3. `src/server/config/multer.ts`
   - Add `uploadXenSplitImages` multer instance (memoryStorage, size limit, image filter)

Phase 2 — Server: Routes (xensplit.ts)
1. POST `/api/xensplit/groups/:groupId/expenses/:expenseId/images`
   - `authenticateToken` → `validateParams` → `uploadXenSplitImages.array('images', 5)`
   - Upload each file with `uploadToGCS(buffer, gcsPath, contentType, true)`
   - Push `{ gcs_path }` into `expense.images`; return updated group
2. DELETE `/api/xensplit/groups/:groupId/expenses/:expenseId/images/:imageId`
   - Delete `gcs_path` via `deleteFromGCS(gcs_path, true)`, remove subdoc, save
3. GET `/api/xensplit/groups/:groupId/expenses/:expenseId/image-urls`
   - Generate signed URLs for each `expense.images` entry using `generateSignedUrl(gcs_path, 15)` and return `{ _id, signedUrl }[]`
4. Update DELETE expense handler to cascade-delete all `expense.images` using `deleteFromGCS(gcs_path, true)` before removing the expense
5. Update POST expense handler to return the created expense's `_id` so client can chain image upload

Phase 3 — Client: Types & Hooks
1. `src/client/hooks/xensplit/types.ts`
   - Add `XenSplitExpenseImage { _id: string; gcs_path: string }`
   - Add `images?: XenSplitExpenseImage[]` to `XenSplitExpense`
2. `src/client/hooks/xensplit/useExpenses.ts`
   - Add `uploadExpenseImages` mutation (FormData POST)
   - Add `deleteExpenseImage` mutation (DELETE)
   - Add `useExpenseImageUrls(groupId, expenseId, count)` query that calls the GET image-urls endpoint when `count > 0`
   - Expose `addExpenseAsync` / `updateExpenseAsync` (mutateAsync variants) for chaining

Phase 4 — Client: UI (3-step ExpenseForm)
1. `src/client/routes/Internal/Xensplit/components/ExpenseForm.tsx`
   - New props: `images`, `onImagesChange`, `existingImageUrls?`, `existingImages?`, `onDeleteExistingImage?`, `isDeletingImage?`
   - Add `Stepper` with steps: Details, Split, Photos
   - Step 3: notes, existing thumbnails (use signed URLs), hidden file input for new images, previews via `URL.createObjectURL`, enforce max 5 total
   - Navigation: Back / Next / Submit (Next gated per-step rules)

Phase 5 — Client: GroupDetail wiring
1. `src/client/routes/Internal/Xensplit/GroupDetail.tsx`
   - Add state: `addImages`, `editImages`, `lightboxUrl`
   - Use `addExpenseAsync` / `updateExpenseAsync` for create/update then call `uploadExpenseImages` if any files present
   - Use `useExpenseImageUrls` to fetch signed URLs when view/edit modals open; pass to `ExpenseForm` as `existingImageUrls`
   - Lightbox dialog displays signed URL image

Verification
- Add/edit/view flows, signed URL fetch on open, deletion cascades, UI enforces limits, server rejects non-images, run TypeScript checks

Files to change (summary)
- `src/server/models/xenSplit.js`
- `src/server/constants/index.ts`
- `src/server/config/multer.ts`
- `src/server/routes/xensplit.ts`
- `src/client/hooks/xensplit/types.ts`
- `src/client/hooks/xensplit/useExpenses.ts`
- `src/client/routes/Internal/Xensplit/components/ExpenseForm.tsx`
- `src/client/routes/Internal/Xensplit/GroupDetail.tsx`

Next steps: I can implement these changes in small commits. Tell me whether to proceed with Phase 1 edits first (models/constants/multer) or start with client types/hooks.