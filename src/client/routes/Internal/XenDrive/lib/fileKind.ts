// What sort of file something is, for its icon, colour and the Type filter.

export type FileKind = "image" | "pdf" | "archive" | "text" | "video" | "audio" | "file";

export const KIND_LABEL: Record<FileKind, string> = {
  image: "Image",
  pdf: "PDF",
  archive: "Archive",
  text: "Text",
  video: "Video",
  audio: "Audio",
  file: "File",
};

/** The theme colour each kind is tinted with: image teal (info), PDF red, archive amber, text blue. */
export const KIND_COLOR: Record<FileKind, "info" | "error" | "warning" | "primary" | "secondary" | "inherit"> = {
  image: "info",
  pdf: "error",
  archive: "warning",
  text: "primary",
  video: "secondary",
  audio: "secondary",
  file: "inherit",
};

const ARCHIVE = /zip|compressed|archive|tar|gzip|7z|rar/;
const TEXT = /^text\/|json|xml|csv|markdown|javascript/;

export function fileKindOf(mimeType: string): FileKind {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (ARCHIVE.test(mime)) return "archive";
  if (TEXT.test(mime)) return "text";
  return "file";
}

/** Can the browser show this inside the page? (The server only gives a preview link for these.) */
export const isPreviewable = (mimeType: string): boolean => {
  const kind = fileKindOf(mimeType);
  return kind === "image" || kind === "pdf" || kind === "video" || kind === "audio";
};
