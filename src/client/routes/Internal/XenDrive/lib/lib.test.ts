import { describe, it, expect } from "vitest";
import { fileKindOf, isPreviewable } from "./fileKind";
import { expiryLabel, folderContentsLabel, formatModified, itemCountLabel } from "./driveFormat";
import { applyFilters, filtersActive, matchesLink } from "./driveFilters";
import { nextWaiting, summarize, uploadReducer, type UploadItem } from "./uploadQueue";
import type { XenDriveFile } from "../../../../types/XenDriveFile";

describe("fileKindOf / isPreviewable", () => {
  it("sorts mime types into the kinds the list shows", () => {
    expect(fileKindOf("image/jpeg")).toBe("image");
    expect(fileKindOf("application/pdf")).toBe("pdf");
    expect(fileKindOf("application/zip")).toBe("archive");
    expect(fileKindOf("application/x-7z-compressed")).toBe("archive");
    expect(fileKindOf("text/csv")).toBe("text");
    expect(fileKindOf("application/json")).toBe("text");
    expect(fileKindOf("video/mp4")).toBe("video");
    expect(fileKindOf("audio/mpeg")).toBe("audio");
    expect(fileKindOf("application/octet-stream")).toBe("file");
    expect(fileKindOf("")).toBe("file");
  });

  it("previews only what a browser can show", () => {
    expect(["image/png", "application/pdf", "video/mp4", "audio/ogg"].every(isPreviewable)).toBe(true);
    expect(["application/zip", "text/plain", "application/octet-stream"].some(isPreviewable)).toBe(false);
  });
});

describe("dates and counts", () => {
  const now = new Date(2026, 10, 12, 15, 0); // Nov 12, 2026, 3 pm local

  it("says Today with the time, Yesterday, then the date (with the year when it differs)", () => {
    expect(formatModified(new Date(2026, 10, 12, 9, 41).toISOString(), now)).toBe("Today, 9:41 AM");
    expect(formatModified(new Date(2026, 10, 11, 20, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatModified(new Date(2026, 9, 3, 12, 0).toISOString(), now)).toBe("Oct 3");
    expect(formatModified(new Date(2025, 9, 3, 12, 0).toISOString(), now)).toBe("Oct 3, 2025");
  });

  it("describes an expiry", () => {
    expect(expiryLabel(null, now)).toBe("No expiry");
    expect(expiryLabel(new Date(2026, 10, 12, 14, 0).toISOString(), now)).toBe("Expired");
    expect(expiryLabel(new Date(2026, 10, 14, 15, 0).toISOString(), now)).toBe("Expires in 2 days");
  });

  it("words item counts and folder contents", () => {
    expect([0, 1, 9].map(itemCountLabel)).toEqual(["Empty", "1 item", "9 items"]);
    expect(folderContentsLabel({ folders: 3, files: 82 })).toBe("3 folders and 82 files");
    expect(folderContentsLabel({ folders: 1, files: 1 })).toBe("1 folder and 1 file");
    expect(folderContentsLabel({ folders: 0, files: 4 })).toBe("4 files");
    expect(folderContentsLabel({ folders: 2, files: 0 })).toBe("2 folders");
    expect(folderContentsLabel({ folders: 0, files: 0 })).toBe("Nothing yet");
  });
});

describe("filters", () => {
  const now = new Date(2026, 10, 12, 12, 0);
  const file = (over: Partial<XenDriveFile>): XenDriveFile => ({
    _id: "x",
    name: "f",
    folder_id: null,
    mimeType: "application/octet-stream",
    size: 1,
    createdAt: now.toISOString(),
    shared: false,
    ...over,
  });
  const files = [
    file({ _id: "img", mimeType: "image/png", shared: true }),
    file({ _id: "pdf", mimeType: "application/pdf", hasPassword: true }),
    file({ _id: "zip", mimeType: "application/zip", expiry: new Date(2026, 10, 14).toISOString() }),
    file({ _id: "old", mimeType: "text/plain", expiry: new Date(2026, 9, 1).toISOString() }),
    file({ _id: "far", mimeType: "text/plain", expiry: new Date(2027, 5, 1).toISOString() }),
  ];
  const ids = (list: XenDriveFile[]) => list.map((f) => f._id);

  it("filters by type", () => {
    expect(ids(applyFilters(files, { type: "image", link: "all" }, now))).toEqual(["img"]);
    expect(ids(applyFilters(files, { type: "text", link: "all" }, now))).toEqual(["old", "far"]);
    expect(applyFilters(files, { type: "all", link: "all" }, now)).toBe(files);
  });

  it("filters by link status; expiring means within a week and not already over", () => {
    expect(ids(applyFilters(files, { type: "all", link: "shared" }, now))).toEqual(["img"]);
    expect(ids(applyFilters(files, { type: "all", link: "password" }, now))).toEqual(["pdf"]);
    expect(ids(applyFilters(files, { type: "all", link: "expiring" }, now))).toEqual(["zip"]);
    expect(matchesLink(file({}), "expiring", now)).toBe(false);
  });

  it("combines both, and knows when any is on", () => {
    expect(ids(applyFilters(files, { type: "archive", link: "expiring" }, now))).toEqual(["zip"]);
    expect(filtersActive({ type: "all", link: "all" })).toBe(false);
    expect(filtersActive({ type: "pdf", link: "all" })).toBe(true);
  });
});

describe("upload queue", () => {
  const add = (state: UploadItem[], ...names: string[]) =>
    uploadReducer(state, {
      type: "add",
      items: names.map((name, i) => ({ id: state.length + i, name, size: 100, folderId: null })),
    });

  it("adds files as waiting and hands them out in order", () => {
    const s = add([], "a", "b");
    expect(s.map((i) => i.status)).toEqual(["waiting", "waiting"]);
    expect(nextWaiting(s)?.name).toBe("a");
  });

  it("moves a file through uploading to done, and tracks progress within 0-100", () => {
    let s = add([], "a");
    s = uploadReducer(s, { type: "start", id: 0 });
    s = uploadReducer(s, { type: "progress", id: 0, percent: 140 });
    expect(s[0]).toMatchObject({ status: "uploading", percent: 100 });
    s = uploadReducer(s, { type: "done", id: 0 });
    expect(s[0].status).toBe("done");
    expect(nextWaiting(s)).toBeUndefined();
  });

  it("a failure keeps its reason, and a retry puts it back in line", () => {
    let s = add([], "a");
    s = uploadReducer(s, { type: "fail", id: 0, error: "Quota exceeded" });
    expect(s[0]).toMatchObject({ status: "failed", error: "Quota exceeded" });
    s = uploadReducer(s, { type: "retry", id: 0 });
    expect(s[0]).toMatchObject({ status: "waiting", percent: 0, error: undefined });
  });

  it("cancel stops a waiting or running file but never undoes a finished one", () => {
    let s = add([], "a", "b");
    s = uploadReducer(s, { type: "done", id: 0 });
    s = uploadReducer(s, { type: "cancel", id: 0 });
    s = uploadReducer(s, { type: "cancel", id: 1 });
    expect(s.map((i) => i.status)).toEqual(["done", "cancelled"]);
  });

  it("clear empties the tray", () => {
    expect(uploadReducer(add([], "a"), { type: "clear" })).toEqual([]);
  });

  it("summarises: the heading while running, and after", () => {
    let s = add([], "a", "b", "c", "d", "e");
    s = uploadReducer(s, { type: "done", id: 0 });
    s = uploadReducer(s, { type: "done", id: 1 });
    s = uploadReducer(s, { type: "start", id: 2 });
    s = uploadReducer(s, { type: "progress", id: 2, percent: 50 });
    expect(summarize(s)).toMatchObject({
      total: 5,
      done: 2,
      active: 3,
      running: true,
      title: "Uploading 3 of 5",
      percent: 50,
    });

    s = uploadReducer(s, { type: "done", id: 2 });
    s = uploadReducer(s, { type: "done", id: 3 });
    s = uploadReducer(s, { type: "fail", id: 4, error: "x" });
    expect(summarize(s)).toMatchObject({ running: false, done: 4, failed: 1, title: "4 uploaded · 1 failed" });
  });

  it("an empty tray summarises to nothing running", () => {
    expect(summarize([])).toMatchObject({ total: 0, running: false, percent: 0 });
  });
});
