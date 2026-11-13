import type { GuideApp } from "./appGuide";

// What changed, for the people who use the hub. Newest first. Claude adds an entry in every PR that adds a feature or
// changes how something works (see CLAUDE.md). Write for a user, not a developer: say what you can now do ("Added…",
// "You can now…", "Fixed…"), never a PR number, file name or technical term.

export interface ChangelogEntry {
  /** The day it shipped, YYYY-MM-DD. */
  date: string;
  /** The app it is about, or "hub" for the hub as a whole. */
  app: GuideApp;
  /** One short sentence. */
  title: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-11-13",
    app: "hub",
    title: "Added a What's new page, tips on Home, and a way to send feedback",
  },
  {
    date: "2026-11-13",
    app: "hub",
    title: "Added sharing to the hub from your phone",
  },
  {
    date: "2026-11-13",
    app: "hub",
    title: "Admins can back up and restore the whole database",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "Added a step-by-step cooking view",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "Added a meal planner and a shopping list made from it",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "You can now import a recipe from a web address",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "You can now show a recipe in metric or US units",
  },
  {
    date: "2026-11-13",
    app: "xennote",
    title: "Added Markdown and links between notes",
  },
  {
    date: "2026-11-13",
    app: "xennote",
    title: "Added reminders on notes",
  },
  {
    date: "2026-11-13",
    app: "xennote",
    title: "You can now reorder checklist items with arrows on a touchscreen",
  },
  {
    date: "2026-11-13",
    app: "xenroutine",
    title: "You can now add a note and photos when you mark a routine done",
  },
  {
    date: "2026-11-13",
    app: "xenroutine",
    title: "Added checklists to routines",
  },
  {
    date: "2026-11-13",
    app: "xendrive",
    title: "Safer share links, with more control over folder links",
  },
  {
    date: "2026-11-13",
    app: "xenlink",
    title: "Added click counts, your own short names, expiry dates and QR codes",
  },
  {
    date: "2026-11-13",
    app: "xenlink",
    title: "Fixed creating a short link failing after you had deleted one",
  },
];
