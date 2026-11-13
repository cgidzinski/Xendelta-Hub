import { describe, it, expect } from "vitest";
import { APP_GUIDE, GUIDE_APPS } from "@shared/appGuide";
import { APPS_REGISTRY } from "./apps";

// A new sub-app is added to the registry in constants/apps.ts. It must also say what it is for and give tips in
// src/shared/appGuide.ts, or it would be missing from the About page and the public pages.
describe("app guide coverage", () => {
  it("every registered app has a guide entry", () => {
    for (const app of APPS_REGISTRY) {
      expect(GUIDE_APPS as readonly string[], `${app.key} needs an entry in src/shared/appGuide.ts`).toContain(app.key);
      expect(APP_GUIDE[app.key as keyof typeof APP_GUIDE].about.length).toBeGreaterThan(0);
    }
  });
  it("every guide entry is a registered app (or the hub)", () => {
    const keys = APPS_REGISTRY.map((a) => a.key);
    for (const app of GUIDE_APPS) if (app !== "hub") expect(keys, app).toContain(app);
  });
});
