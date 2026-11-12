import { Types } from "mongoose";
import { XenDriveFile } from "../models/xendriveFile";
import { driveSourceApp } from "./driveSources";
import type { StorageByApp } from "@shared/admin";

export const DAY_MS = 86_400_000;
/** A person is "near their limit" from here. */
export const NEAR_QUOTA = 0.9;

/** An ObjectId that sorts at or after the moment `date` (accounts are dated by their _id). */
export const objectIdFrom = (date: Date) => Types.ObjectId.createFromTime(Math.floor(date.getTime() / 1000));

/** What is stored, by where it came from: My Drive, and each app that stores files in the drive (chat). */
export async function storageByApp(): Promise<StorageByApp[]> {
  const rows = await XenDriveFile.aggregate<{ _id: string; bytes: number; files: number }>([
    {
      $group: {
        _id: { $ifNull: ["$source.app", "drive"] },
        bytes: { $sum: { $ifNull: ["$size", 0] } },
        files: { $sum: 1 },
      },
    },
    { $sort: { bytes: -1 } },
  ]);
  return rows.map((r) => ({
    key: r._id,
    label: r._id === "drive" ? "My Drive" : (driveSourceApp(r._id)?.label ?? r._id),
    bytes: r.bytes,
    files: r.files,
  }));
}

/** A readable name for a scheduled task ("XenSplit recurring expense: Flat 4B"), from its type and, if it has one, its title. */
export function taskLabel(task: { task_type: string; payload?: any }): string {
  const named = task.payload?.title ?? task.payload?.name ?? task.payload?.group_name;
  const [first, ...rest] = task.task_type.split(/[:_-]+/).filter(Boolean);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  // "xensplit" reads as "XenSplit": the app names are Xen + a word.
  const app = /^xen[a-z]+$/i.test(first ?? "") ? `Xen${cap(first.slice(3).toLowerCase())}` : cap(first ?? "Task");
  const type = [app, ...rest.map((w) => w.toLowerCase())].join(" ");
  return named ? `${type}: ${named}` : type;
}

export const formatBytes = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : bytes >= 1024 ** 2
      ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;
