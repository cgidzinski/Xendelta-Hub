import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// Routes refuse a request by throwing AppError(status, message) (utils/http.ts); the errorHandler in server.ts turns it into
// { status: false, message }. Writing that body by hand in each route is what this keeps from coming back. The files below
// still do it and are being moved over one area at a time; a file leaves the list when it no longer matches, and nothing new
// can join it. (A route that wraps its whole body in try/catch has to be moved by hand: a thrown AppError would land in its
// own catch and become a 500, so a mechanical rewrite is not safe there.)
const STILL_HAND_WRITTEN: Record<string, string> = {
  "xenlink.ts": "moved in the owner_id change (#258)",
};

// Files that still read the caller's id by casting the request.
const STILL_CASTING: Record<string, string> = {
  "xenlink.ts": "moved in the owner_id change (#258)",
};

// A hand-written refusal: res.status(4xx or 5xx).json(...) or the kitchen/routine helper fail(res, 4xx, ...).
const HAND_WRITTEN = /\.status\([45]\d\d\)\s*\.json\(|\bfail\(res,\s*[45]\d\d/;

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe("route error conventions", () => {
  const files = routeFiles(__dirname).map((f) => ({
    rel: relative(__dirname, f).split("\\").join("/"),
    text: readFileSync(f, "utf8"),
  }));

  it("no route writes a refusal by hand unless it is on the list", () => {
    const offenders = files
      .filter((f) => HAND_WRITTEN.test(f.text) && !(f.rel in STILL_HAND_WRITTEN))
      .map((f) => f.rel);
    expect(offenders, "throw new AppError(status, message) from utils/http.ts instead").toEqual([]);
  });

  it("the list only names files that still do it (so it shrinks as they are moved)", () => {
    const stale = Object.keys(STILL_HAND_WRITTEN).filter((rel) => {
      const file = files.find((f) => f.rel === rel);
      return !file || !HAND_WRITTEN.test(file.text);
    });
    expect(stale).toEqual([]);
  });

  const CAST = "as AuthenticatedRequest).user!._id";
  it("a route reads the signed-in person's id with callerId, not by casting the request, unless it is on the list", () => {
    const casts = files.filter((f) => f.text.includes(CAST) && !(f.rel in STILL_CASTING)).map((f) => f.rel);
    expect(casts, "use callerId(req) from utils/http.ts").toEqual([]);
  });

  it("that list only names files that still do it", () => {
    const stale = Object.keys(STILL_CASTING).filter((rel) => !files.find((f) => f.rel === rel)?.text.includes(CAST));
    expect(stale).toEqual([]);
  });
});
