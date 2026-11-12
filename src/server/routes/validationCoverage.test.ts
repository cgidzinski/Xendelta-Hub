import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// Every route that takes a path parameter must validate it (so a bad id is a 400, not a Mongoose
// CastError 500), and every route that takes a JSON body must validate that too. New sub-apps
// add routes constantly; this keeps the rule from eroding. A route that genuinely needs an
// exception goes in the lists below, with the reason.
//
// Reads the source rather than booting the app: the property is "this registration lists a
// validation middleware", which the registration text answers directly.

const ROUTES_DIR = __dirname;

/** "METHOD /path" routes that take a path param but are deliberately not validated, and why. */
const PARAMS_EXEMPT: Record<string, string> = {};

/** "METHOD /path" routes that read a body but are deliberately not validated, and why. */
const BODY_EXEMPT: Record<string, string> = {
  "POST /api/user/link-google": "no body: authenticated trigger for an OAuth redirect flow",
  "POST /api/xennote/notes/:id/images": "multipart upload handled by multer, not JSON",
  "POST /api/xennote/notes/:id/share": "no body: turns on the note's public link (path names the note)",
  "POST /api/xennote/notes/:id/share/rotate": "no body: replaces the note's public link (path names the note)",
  "POST /api/xennote/notebooks/:id/share": "no body: turns on the notebook's public link (path names the notebook)",
  "POST /api/xennote/notebooks/:id/share/rotate":
    "no body: replaces the notebook's public link (path names the notebook)",
  "POST /api/user/link-github": "no body: authenticated trigger for an OAuth redirect flow",
  "POST /api/user/link-discord": "no body: authenticated trigger for an OAuth redirect flow",
  "POST /api/user/avatar": "multipart upload handled by multer, not JSON",
  "POST /api/recipaint/upload-asset": "multipart upload handled by multer, not JSON",
  "POST /api/admin/blog/upload-asset": "multipart upload handled by multer, not JSON",
  "POST /api/recipaint/:id/clone": "no body: clones the recipe named by the path",
  "POST /api/admin/users/:userId/avatar/reset": "no body: resets the avatar of the user named by the path",
  "POST /api/xendrive/folders/:folderId/share": "no body: turns on the folder's public link (path names the folder)",
  "POST /api/xendrive/files/:fileId/share/rotate": "no body: replaces the file's link (path names the file)",
  "POST /api/xendrive/folders/:folderId/share/rotate":
    "no body: replaces the folder's public link (path names the folder)",
  "POST /api/admin/backups": "no body: starts a backup of the whole database",
  "POST /api/admin/debug/trigger-error": "no body: throws on purpose to test error reporting",
  "POST /api/auth/verify": "no body: refreshes the token of the authenticated caller",
  "PUT /api/user/notifications/mark-read": "no body: marks the caller's notifications read",
  "PUT /api/user/notifications/:notificationId/mark-read": "no body: path identifies the notification",
  "POST /api/xenbudget/books/:bookId/reseed-labels": "no body: restores the book's starter labels",
  "POST /api/xenbudget/books/:bookId/items/preview":
    "checks its own envelope: array of rows, non-empty, capped at MAX_BULK_ROWS",
  "POST /api/xenbudget/books/:bookId/items/:itemId/images": "multipart upload handled by multer, not JSON",
  "POST /api/xenkitchen/books/:id/share": "no body: creates the share link",
  "POST /api/xenkitchen/books/:id/share/rotate": "no body: replaces the share link",
  "POST /api/xenkitchen/items/:id/favorite": "no body: the method (POST/DELETE) carries the intent",
  "POST /api/xenkitchen/items/:id/duplicate": "no body: copies the item named by the path",
  "POST /api/xenkitchen/items/:id/images": "multipart upload handled by multer, not JSON",
  "POST /api/xenkitchen/items/:id/share": "no body: creates the share link",
  "POST /api/xenkitchen/items/:id/share/rotate": "no body: replaces the share link",
  "POST /api/xensplit/groups/:groupId/image": "multipart upload handled by multer, not JSON",
  "POST /api/xensplit/groups/:groupId/expenses/:expenseId/images": "multipart upload handled by multer, not JSON",
  "POST /api/xensplit/groups/:groupId/expenses/:expenseId/restore": "no body: restores the soft-deleted expense",
  "POST /api/xensplit/groups/:groupId/settlements/:settlementId/restore":
    "no body: restores the soft-deleted settlement",
  "POST /api/xensplit/groups/:groupId/exchanges/:exchangeId/restore": "no body: restores the soft-deleted exchange",
  "PUT /api/chat/conversations/:conversationId/messages/:seq/reactions/:emoji":
    "no body: the path names the message and the emoji",
  "POST /api/user/inventory/:inventoryItemId/use": "no body: path identifies the item",
  "POST /api/user/inventory/:inventoryItemId/equip": "no body: path identifies the item",
  "POST /api/user/inventory/:inventoryItemId/unequip": "no body: path identifies the item",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

interface Registration {
  file: string;
  method: string;
  path: string;
  chain: string;
}

/** Where a registration's middleware list ends and its handler begins. */
const HANDLER_START = /async\s+function|\bfunction\b|\bhandle\(|=>|\);/;

function registrations(): Registration[] {
  const found: Registration[] = [];
  // The path argument is a string literal, a template literal (`${base}/:labelId`), an array of
  // paths (one handler for several URLs), or a variable holding the path.
  const start = /app\.(get|post|put|delete|patch)\(\s*("[^"]+"|`[^`]+`|\[[^\]]*\]|\w+)\s*,/g;
  for (const file of walk(ROUTES_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(start)) {
      const rest = source.slice(m.index! + m[0].length);
      const end = rest.search(HANDLER_START);
      found.push({
        file: relative(ROUTES_DIR, file),
        method: m[1].toUpperCase(),
        path: m[2].replace(/^["`]|["`]$/g, ""),
        chain: end === -1 ? rest : rest.slice(0, end),
      });
    }
  }
  return found;
}

/** Every `app.METHOD(` call in the route files, however it is written. */
function countAllRegistrations(): number {
  return walk(ROUTES_DIR).reduce(
    (sum, file) => sum + (readFileSync(file, "utf8").match(/app\.(get|post|put|delete|patch)\(/g)?.length ?? 0),
    0,
  );
}

describe("route validation coverage", () => {
  const routes = registrations();

  it("sees every route (a registration written in an unexpected way would otherwise escape the checks)", () => {
    expect(routes.length).toBe(countAllRegistrations());
    expect(routes.length).toBeGreaterThan(150);
  });

  it("validates every path parameter", () => {
    const missing = routes
      .filter((r) => /\/:\w+/.test(r.path))
      .filter((r) => !/validateParams\(/.test(r.chain))
      .map((r) => `${r.method} ${r.path}  (${r.file})`)
      .filter((label) => !(label.split("  (")[0] in PARAMS_EXEMPT));
    expect(missing, "add validateParams(...) or list the route in PARAMS_EXEMPT with a reason").toEqual([]);
  });

  it("validates every JSON body", () => {
    const missing = routes
      .filter((r) => ["POST", "PUT", "PATCH"].includes(r.method))
      .filter((r) => !/validate\(/.test(r.chain))
      .map((r) => `${r.method} ${r.path}  (${r.file})`)
      .filter((label) => !(label.split("  (")[0] in BODY_EXEMPT));
    expect(missing, "add validate(...) or list the route in BODY_EXEMPT with a reason").toEqual([]);
  });

  it("keeps the exemption lists honest (no entry for a route that no longer exists)", () => {
    const known = new Set(routes.map((r) => `${r.method} ${r.path}`));
    const stale = [...Object.keys(PARAMS_EXEMPT), ...Object.keys(BODY_EXEMPT)].filter((k) => !known.has(k));
    expect(stale).toEqual([]);
  });
});
