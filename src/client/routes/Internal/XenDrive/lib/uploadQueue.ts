// The upload tray's state: pure, so the transitions and the wording can be tested without a browser.

export type UploadStatus = "waiting" | "uploading" | "done" | "failed" | "cancelled";

export interface UploadItem {
  id: number;
  name: string;
  size: number;
  /** The folder it goes into; null is the top level. */
  folderId: string | null;
  /** The file's mime type, for its icon. */
  mimeType?: string;
  status: UploadStatus;
  percent: number;
  error?: string;
}

export type UploadAction =
  | { type: "add"; items: Array<Pick<UploadItem, "id" | "name" | "size" | "folderId" | "mimeType">> }
  | { type: "start"; id: number }
  | { type: "progress"; id: number; percent: number }
  | { type: "done"; id: number }
  | { type: "fail"; id: number; error: string }
  | { type: "cancel"; id: number }
  | { type: "retry"; id: number }
  | { type: "clear" };

const update = (items: UploadItem[], id: number, change: Partial<UploadItem>) =>
  items.map((i) => (i.id === id ? { ...i, ...change } : i));

export function uploadReducer(items: UploadItem[], action: UploadAction): UploadItem[] {
  switch (action.type) {
    case "add":
      return [...items, ...action.items.map((i) => ({ ...i, status: "waiting" as const, percent: 0 }))];
    case "start":
      return update(items, action.id, { status: "uploading", percent: 0, error: undefined });
    case "progress":
      return update(items, action.id, { percent: Math.min(100, Math.max(0, action.percent)) });
    case "done":
      return update(items, action.id, { status: "done", percent: 100 });
    case "fail":
      return update(items, action.id, { status: "failed", error: action.error });
    case "cancel":
      // a file that is still waiting just leaves; one that is uploading is marked so the runner stops it
      return items.map((i) => (i.id === action.id && i.status !== "done" ? { ...i, status: "cancelled" as const } : i));
    case "retry":
      return update(items, action.id, { status: "waiting", percent: 0, error: undefined });
    case "clear":
      return [];
  }
}

export interface UploadSummary {
  total: number;
  done: number;
  failed: number;
  /** Still to do: waiting or uploading. */
  active: number;
  running: boolean;
  /** Overall progress across every file, 0-100. */
  percent: number;
  /** The tray's heading: "Uploading 3 of 5", "4 uploaded · 1 failed". */
  title: string;
}

export function summarize(items: UploadItem[]): UploadSummary {
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const cancelled = items.filter((i) => i.status === "cancelled").length;
  const active = items.filter((i) => i.status === "waiting" || i.status === "uploading").length;
  const running = active > 0;

  const percent =
    total === 0
      ? 0
      : Math.round(
          items.reduce((sum, i) => sum + (i.status === "done" ? 100 : i.status === "uploading" ? i.percent : 0), 0) /
            total,
        );

  let title: string;
  if (running) {
    // "3 of 5": the file in progress counts, so two finished and one running reads "3 of 5"
    const position = Math.min(total, done + failed + cancelled + 1);
    title = `Uploading ${position} of ${total}`;
  } else {
    const parts = [`${done} uploaded`];
    if (failed) parts.push(`${failed} failed`);
    if (cancelled) parts.push(`${cancelled} cancelled`);
    title = parts.join(" · ");
  }
  return { total, done, failed, active, running, percent, title };
}

/** The next file to upload, in the order they were added. */
export const nextWaiting = (items: UploadItem[]): UploadItem | undefined => items.find((i) => i.status === "waiting");
