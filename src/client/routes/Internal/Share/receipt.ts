// Sharing a photo of a receipt to an expense app: the share page sends the person to the group or book they pick, with
// this query flag, and that page opens its "new expense" form with the photos already attached.

export const RECEIPT_PARAM = "receipt";

/** Both expense forms take up to this many photos. */
export const MAX_RECEIPT_IMAGES = 10;

export type ReceiptApp = "xensplit" | "xenbudget";

/** Where the receipt goes: the group's expenses or the book's items, flagged so the page picks the photos up. */
export const receiptPath = (app: ReceiptApp, id: string) =>
  app === "xensplit"
    ? `/internal/xensplit/groups/${id}/expenses?${RECEIPT_PARAM}=1`
    : `/internal/xenbudget/books/${id}/items?${RECEIPT_PARAM}=1`;

/** The photos among what was shared, no more than the form takes. Other files are left out. */
export const receiptImages = (files: File[], max: number) =>
  files.filter((f) => f.type.startsWith("image/")).slice(0, max);
