import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Express matches routes in registration order, so a literal path that looks like a
// parameter value must be registered before the parameterised route that would swallow it.
// Getting this wrong is silent: the request is handled, just by the wrong route, and then
// fails downstream when "asset" or "paints" is cast to an ObjectId.
//
// Asserting on the source is deliberate - the route module pulls in the database models and
// auth middleware, so standing the real router up in a unit test is not worth it, and the
// property being protected is literally the order the lines appear in.
const source = readFileSync(join(__dirname, "recipaint.ts"), "utf8");

const registrationIndex = (method: string, path: string): number => {
  const at = source.indexOf(`app.${method}("${path}"`);
  expect(at, `expected ${method.toUpperCase()} ${path} to be registered`).toBeGreaterThan(-1);
  return at;
};

describe("recipaint route registration order", () => {
  it("registers DELETE /api/recipaint/asset before DELETE /api/recipaint/:id", () => {
    expect(registrationIndex("delete", "/api/recipaint/asset")).toBeLessThan(
      registrationIndex("delete", "/api/recipaint/:id"),
    );
  });

  it("registers GET /api/recipaint/paints before GET /api/recipaint/:id", () => {
    expect(registrationIndex("get", "/api/recipaint/paints")).toBeLessThan(
      registrationIndex("get", "/api/recipaint/:id"),
    );
  });

  it("registers GET /api/recipaint/public before GET /api/recipaint/:id", () => {
    expect(registrationIndex("get", "/api/recipaint/public")).toBeLessThan(
      registrationIndex("get", "/api/recipaint/:id"),
    );
  });
});
