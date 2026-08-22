import { describe, it, expect } from "vitest";
import { activeIndex, TAB_PATHS, SETTINGS_SECTIONS } from "./navigation";

const base = "/internal/xenbudget/books/68abc123";
const sectionPaths = SETTINGS_SECTIONS.map((s) => s.path);

describe("top-level tab matching", () => {
    it("selects the tab for a plain tab URL", () => {
        expect(activeIndex(`${base}/overview`, TAB_PATHS)).toBe(0);
        expect(activeIndex(`${base}/items`, TAB_PATHS)).toBe(1);
        expect(activeIndex(`${base}/report`, TAB_PATHS)).toBe(2);
        expect(activeIndex(`${base}/settings`, TAB_PATHS)).toBe(3);
    });

    it("keeps Settings selected while inside any of its sections", () => {
        // The regression this file exists for: a suffix match returns nothing here, and
        // the tab bar renders with no tab highlighted.
        for (const section of sectionPaths) {
            expect(activeIndex(`${base}/settings/${section}`, TAB_PATHS)).toBe(3);
        }
    });

    it("returns false rather than -1 for a path on no tab", () => {
        // MUI's Tabs wants `false` for "nothing selected"; -1 logs a warning and misrenders.
        expect(activeIndex("/internal/xenbudget/books", TAB_PATHS)).toBe(false);
        expect(activeIndex("/internal/home", TAB_PATHS)).toBe(false);
    });

    it("is not fooled by a book id or query string that contains a tab name", () => {
        expect(activeIndex(`${base}/items?q=report`, TAB_PATHS)).toBe(1);
        expect(activeIndex("/internal/xenbudget/books/settingsbook/items", TAB_PATHS)).toBe(1);
    });
});

describe("settings section matching", () => {
    it("selects the section it is on", () => {
        sectionPaths.forEach((section, i) => {
            expect(activeIndex(`${base}/settings/${section}`, sectionPaths)).toBe(i);
        });
    });

    it("finds no section on bare /settings, so the caller can fall back to the first", () => {
        expect(activeIndex(`${base}/settings`, sectionPaths)).toBe(false);
    });
});

describe("the two lists must not collide", () => {
    it("shares no name between a tab and a section", () => {
        // A section called "items" would light up the Items tab instead of Settings —
        // segment matching cannot tell the two apart.
        const overlap = sectionPaths.filter((s) => (TAB_PATHS as readonly string[]).includes(s));
        expect(overlap).toEqual([]);
    });

    it("has no duplicates within either list", () => {
        expect(new Set(TAB_PATHS).size).toBe(TAB_PATHS.length);
        expect(new Set(sectionPaths).size).toBe(sectionPaths.length);
    });
});
