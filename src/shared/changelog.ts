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
  /** Optionally one more sentence of detail or how to find it. */
  detail?: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-11-13",
    app: "hub",
    title: "Added a What's new page, tips on Home, and a way to send feedback",
    detail:
      "See what each app is for and what changed, find ideas on Home when it is quiet, and tell us what you think from the sidebar.",
  },
  {
    date: "2026-11-13",
    app: "hub",
    title: "You can now read your notes, routines and recipes without a connection",
    detail: "Tick a checklist item or mark a routine done while offline, and it saves when you are back online.",
  },
  {
    date: "2026-11-13",
    app: "hub",
    title: "Added sharing to the hub from your phone",
    detail:
      "Use the Share button in another app to save a link, some text or a photo as a note, a short link or a file. A photo of a receipt can start a new expense in XenSplit or XenBudget.",
  },
  {
    date: "2026-11-13",
    app: "hub",
    title: "Admins can back up and restore the whole database",
    detail: "On the System page, with an option to make backups automatically and keep the latest ones.",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "Added a step-by-step cooking view",
    detail:
      "Press Step by step on a recipe to see one step at a time in big text, swipe to move on, keep timers running between steps, and tick off ingredients from a sheet.",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "Added a meal planner and a shopping list made from it",
    detail:
      "Plan the week from the Meal plan button, then get one shopping list with the same ingredients added together. Copy it, or send it to XenNote to tick off in the shop.",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "You can now import a recipe from a web address",
    detail: "Paste the link and the title, ingredients, steps and photo are filled in for you.",
  },
  {
    date: "2026-11-13",
    app: "xenkitchen",
    title: "You can now show a recipe in metric or US units",
    detail: "Use the switch above the ingredients. Oven temperatures convert too.",
  },
  {
    date: "2026-11-13",
    app: "xennote",
    title: "Added Markdown and links between notes",
    detail:
      "Format notes with headings, bold and lists, link to another note by typing [[its name]], and see which notes link back.",
  },
  {
    date: "2026-11-13",
    app: "xennote",
    title: "Added reminders on notes",
    detail:
      "Press the bell in a note and pick a time, like in 3 hours or tomorrow morning. You get a notification when it is due, and the reminder is yours alone even in a shared notebook.",
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
    detail: "Use Done with a note or photos on a routine, with up to 5 photos. They show in the routine's history.",
  },
  {
    date: "2026-11-13",
    app: "xenroutine",
    title: "Added checklists to routines",
    detail:
      "Break a routine into steps and tick them off on its card. Marking it done records which steps you did, and asks first if some are left.",
  },
  {
    date: "2026-11-13",
    app: "xendrive",
    title: "The grid now shows small previews of PDFs as well as photos",
  },
  {
    date: "2026-11-13",
    app: "xendrive",
    title: "Added real thumbnails to the photo grid",
    detail: "Folders of photos open much faster.",
  },
  {
    date: "2026-11-13",
    app: "xendrive",
    title: "Safer share links, with more control over folder links",
    detail:
      "Link passwords are now stored safely, and a folder link can have a password, an expiry date and a download count.",
  },
  {
    date: "2026-11-13",
    app: "xenlink",
    title: "Added click counts, your own short names, expiry dates and QR codes",
    detail: "See how often each link was opened, and fixed the Go button that did nothing.",
  },
  {
    date: "2026-11-13",
    app: "xenlink",
    title: "Fixed creating a short link failing after you had deleted one",
  },
];
