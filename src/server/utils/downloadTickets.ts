import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env";

// A public download used to carry the link's password in its address (?password=...), which ends up in browser history,
// server logs and referrers. Now the password goes in a POST, and what comes back is a ticket: a signed pass for one
// file on one link that works for a minute. The browser then downloads from an address holding only the ticket, so the
// file streams straight to disk (instead of being read into the page's memory first) and the password is never in a URL.

const PURPOSE = "xendrive-download";
export const TICKET_SECONDS = 60;

/** A ticket for the file `fileId`, reached through the link `linkToken` (a file link's token, or a folder link's). */
export function signDownloadTicket(linkToken: string, fileId: string): string {
  return jwt.sign({ purpose: PURPOSE, link: linkToken, file: fileId }, getJwtSecret(), { expiresIn: TICKET_SECONDS });
}

/** Whether `ticket` is a current ticket for exactly this file through exactly this link. */
export function isValidDownloadTicket(ticket: unknown, linkToken: string, fileId: string): boolean {
  if (typeof ticket !== "string" || !ticket) return false;
  try {
    const p = jwt.verify(ticket, getJwtSecret()) as { purpose?: string; link?: string; file?: string };
    return p.purpose === PURPOSE && p.link === linkToken && p.file === fileId;
  } catch {
    return false;
  }
}
