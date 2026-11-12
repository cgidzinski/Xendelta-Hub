import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Every admin route that changes something must write to the audit log (utils/adminAudit.ts recordAudit). This counts the
// write routes in each admin file and checks the file records at least that many audit entries, so a new write route
// can't ship without a log line. blog.ts is content editing and debug.ts changes nothing, so neither is audited.
const DIR = __dirname;
const NOT_AUDITED: Record<string, string> = {
  "blog.ts": "content editing, left as it was (a redesign is its own piece of work)",
  "debug.ts": "triggers a test error and changes nothing",
};

describe("admin audit coverage", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts");

  it.each(files)("%s records an audit entry for each route that writes", (file) => {
    if (file in NOT_AUDITED) return;
    const text = readFileSync(join(DIR, file), "utf8");
    const writes = (text.match(/app\.(post|put|patch|delete)\(/g) ?? []).length;
    const audits = (text.match(/recordAudit\(/g) ?? []).length;
    // audit.ts, overview.ts, storage.ts and money.ts only read, so they have no write routes at all.
    expect(audits, `${file} has ${writes} write routes`).toBeGreaterThanOrEqual(writes);
  });

  it("only lists exemptions for files that exist", () => {
    for (const file of Object.keys(NOT_AUDITED)) expect(files).toContain(file);
  });
});
