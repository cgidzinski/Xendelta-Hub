import { AppError } from "./http";

// Files that an app stores in XenDrive on a person's behalf (chat attachments today) carry `source: { app, ref }`.
// They are real XenDrive files: owned by the uploader, counted against their quota, deleted like any file. They are
// hidden from the drive's own lists (My Drive, folders, recent, shared) and listed under XenDrive > From apps instead,
// so an app's uploads don't crowd the drive. docs/storage.md has the plan to move the other apps' photos onto this.
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

/** The filter that keeps app-stored files out of the drive's own lists. Merge it into every drive listing query. */
export const driveOnly = { "source.app": { $exists: false } } as const;
