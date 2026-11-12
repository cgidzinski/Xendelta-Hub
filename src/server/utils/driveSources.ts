import { AppError } from "./http";

// Files that an app stores in XenDrive on a person's behalf (chat attachments, photos on an expense or a note) carry
// `source: { app, ref }`. They are real XenDrive files: owned by the uploader and deleted like any file. They are listed
// under XenDrive > From apps (and, while SHOW_APP_FILES_IN_DRIVE is on, in the drive's own lists too). Whether they count
// against the person's quota is the app's call (`counts`); for now none do. docs/storage.md has the whole picture.
//
// An app registers itself once with `registerDriveSource`; XenDrive never learns what a chat (or a note) is.

export interface DriveSource {
  app: string;
  ref: string;
}

export interface DriveSourceApp {
  /** Shown as the heading in XenDrive > From apps. */
  label: string;
  /** May this person store files for `ref`? (A chat's member may; a stranger may not.) */
  verify: (userId: string, ref: string) => Promise<boolean>;
  /** A readable name per ref for this person ("Weekend trip"). Refs it cannot name are left out. */
  describe: (userId: string, refs: string[]) => Promise<Map<string, string>>;
  /**
   * Do files stored for this `ref` count toward the owner's quota? Every app says no for now: only files uploaded
   * straight to XenDrive count. The intended rule once it is switched on: files in a shared space stay exempt,
   * files in a space only the owner uses count (docs/storage.md).
   */
  counts: (ref: string) => Promise<boolean>;
  /**
   * The person deleted these files from XenDrive. The app drops its references to them (a photo on an expense), so it
   * doesn't show a broken image. Optional: chat attachments need nothing.
   */
  onRemoved?: (ref: string, fileIds: string[]) => Promise<void>;
}

const apps = new Map<string, DriveSourceApp>();

export function registerDriveSource(app: string, definition: DriveSourceApp): void {
  apps.set(app, definition);
}

export const driveSourceApp = (app: string) => apps.get(app);

/** Throws unless the person may store files for this source. */
export async function assertDriveSource(userId: string, source: DriveSource): Promise<void> {
  const definition = apps.get(source.app);
  if (!definition) throw new AppError(400, "Unknown upload source");
  if (!(await definition.verify(userId, source.ref))) throw new AppError(404, "Not found");
}

/**
 * Show app-stored files in the drive's own lists (My Drive, recent, search) as well as in From apps. On while the
 * files are exempt from the quota so people can see and delete them. Set to false to hide them from those lists.
 */
export const SHOW_APP_FILES_IN_DRIVE = true;

/** The filter that keeps app-stored files out of the drive's own lists. Merge it into every drive listing query. */
export const driveOnly: { "source.app"?: { $exists: false } } = SHOW_APP_FILES_IN_DRIVE
  ? {}
  : { "source.app": { $exists: false } };
