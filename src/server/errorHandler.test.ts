import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Express decides a function is an ERROR handler purely by its arity: exactly four parameters.
// Drop an "unused" `next` (an editor or an auto-fixer will happily do it) and the handler becomes
// ordinary middleware that runs for every request with the request object as its "error",
// turning every page into a 500. Nothing type-checks that, so pin it here.
describe("server.ts error handler", () => {
  const source = readFileSync(join(__dirname, "server.ts"), "utf8");

  it("keeps four parameters so Express treats it as an error handler", () => {
    const match = source.match(/app\.use\(\(\s*err\b[^)]*\)\s*=>/);
    expect(match, "expected a final app.use((err, req, res, next) => ...) handler").not.toBeNull();
    const params = match![0]
      .replace(/^app\.use\(\(/, "")
      .replace(/\)\s*=>$/, "")
      .split(",");
    expect(params).toHaveLength(4);
  });
});
