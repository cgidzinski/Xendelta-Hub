// What each app is for, in a few plain lines, and short "did you know" tips. Shown on the What's new page and, when the
// Home activity feed is empty, as tips. Written for people who are new here, not for developers: say what you can DO.
// A new sub-app must add an entry here (a test fails otherwise); see docs/adding-a-sub-app.md.

export const GUIDE_APPS = [
  "hub",
  "recipaint",
  "xendrive",
  "xenlink",
  "xensplit",
  "xenbudget",
  "xenroutine",
  "xenkitchen",
  "xennote",
] as const;

/** An app's key, or "hub" for the parts that belong to no single app (Home, people, messages, notifications). */
export type GuideApp = (typeof GUIDE_APPS)[number];

export interface Tip {
  /** A sentence that starts "You can" or "Try", about one thing the app does. */
  text: string;
  /** Where to try it. */
  link?: string;
}

export interface AppGuideEntry {
  /** Two or three plain sentences: what it is for and who it is for. */
  about: string;
  tips: Tip[];
}

export const APP_GUIDE: Record<GuideApp, AppGuideEntry> = {
  hub: {
    about:
      "Xendelta Hub is one place for the small apps you share with the people around you. Your Home page shows what needs attention and what your people have been up to.",
    tips: [
      {
        text: "Press Edit under All apps on Home to pin the apps you use. They show up at the top with a count of what is waiting.",
        link: "/internal",
      },
      {
        text: "Open Messages to chat with a person or a group, and send photos in the conversation.",
        link: "/internal/messages",
      },
      {
        text: "Install the hub on your phone from your browser's menu to get it as an app, with reminders as notifications.",
        link: "/internal/profile",
      },
      { text: "Use your phone's Share button to send a link, some text or a photo straight to the hub." },
    ],
  },
  recipaint: {
    about:
      "Recipaint is for keeping your paint recipes: the mixes, the images and the notes, so you can make the same colour again.",
    tips: [
      { text: "Add photos to a recipe so you can see the result next to the mix.", link: "/internal/recipaint" },
      { text: "Look through the public recipes for ideas from other people.", link: "/internal/recipaint" },
    ],
  },
  xendrive: {
    about:
      "XenDrive is your file storage: put files in folders, preview them, and share a file or a whole folder with a link.",
    tips: [
      {
        text: "Switch to the grid view to see your photos at a glance.",
        link: "/internal/xendrive",
      },
      {
        text: "Share a folder with a link, and add a password, an expiry date or a download count if you want to control it.",
        link: "/internal/xendrive",
      },
      {
        text: "Upload big files without worry: they go up in pieces and show their progress.",
        link: "/internal/xendrive",
      },
    ],
  },
  xenlink: {
    about: "XenLink makes short links you can send to people, and shows you how many times each one was opened.",
    tips: [
      { text: "Choose your own short name, like /x/summer-party, instead of a random one.", link: "/internal/xenlink" },
      { text: "Give a link an expiry date so it stops working on its own.", link: "/internal/xenlink" },
      { text: "Open a link's QR code to print it or show it on a screen.", link: "/internal/xenlink" },
    ],
  },
  xensplit: {
    about: "XenSplit keeps track of who paid for what in a group, and works out who owes whom so you can settle up.",
    tips: [
      {
        text: "Add a photo of the receipt to an expense so everyone can see what it was for.",
        link: "/internal/xensplit",
      },
      {
        text: "Share a receipt photo from your phone's Share button and pick the group to start the expense.",
        link: "/internal/xensplit",
      },
      {
        text: "Open a group's Balances tab to see the fewest payments that settle everyone up.",
        link: "/internal/xensplit",
      },
    ],
  },
  xenbudget: {
    about:
      "XenBudget is a shared budget book: log what you spend, set budgets by category, and see where the money goes.",
    tips: [
      { text: "Import a bank CSV and let rules sort the items into categories for you.", link: "/internal/xenbudget" },
      {
        text: "Add a photo of a receipt to an item, or share it from your phone straight into a book.",
        link: "/internal/xenbudget",
      },
      {
        text: "Set up a piggy bank to save towards something and add to it a little at a time.",
        link: "/internal/xenbudget",
      },
    ],
  },
  xenroutine: {
    about:
      "XenRoutine reminds you of things you do on a schedule, like changing a filter or testing a smoke alarm, and remembers when you last did them.",
    tips: [
      {
        text: "Slide a routine to mark it done, or press Done with a note or photos to say what you did.",
        link: "/internal/xenroutine",
      },
      { text: "Give a routine a checklist of steps so you can tick them off as you go.", link: "/internal/xenroutine" },
      { text: "Share a routine with someone at home so either of you can mark it done.", link: "/internal/xenroutine" },
    ],
  },
  xenkitchen: {
    about:
      "XenKitchen is your recipe box and kitchen planner: keep recipes, plan the week's meals, and get a shopping list built for you.",
    tips: [
      { text: "Paste a web address into Import and the recipe is filled in for you.", link: "/internal/xenkitchen" },
      {
        text: "Press Step by step on a recipe to see one step at a time in big text, with timers that keep running.",
        link: "/internal/xenkitchen",
      },
      {
        text: "Plan the week in the meal planner and get one shopping list that adds up the ingredients.",
        link: "/internal/xenkitchen",
      },
      { text: "Switch a recipe between metric and US units with one tap.", link: "/internal/xenkitchen" },
    ],
  },
  xennote: {
    about:
      "XenNote is for quick notes, checklists, photos and links, in notebooks you can share with the people around you.",
    tips: [
      { text: "Tick checklist items right from the board, without opening the note.", link: "/internal/xennote" },
      {
        text: "Link one note to another by typing its name in double square brackets, and see what links back.",
        link: "/internal/xennote",
      },
      { text: "Format a note with Markdown: headings, bold, lists and links.", link: "/internal/xennote" },
      {
        text: "Press the bell on a note to set a reminder, and get a notification when it is due.",
        link: "/internal/xennote",
      },
    ],
  },
};

/** A small, fixed shuffle: the same seed always gives the same order (so tips don't change on every render). */
function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h ^= h >>> 16) >>> 0;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface PickedTip extends Tip {
  app: GuideApp;
}

/**
 * Up to `count` tips for the "did you know" block. The same `seed` (use today's date) gives the same tips, so they stay
 * put while someone is on the page and change from day to day. With `app`, only that app's tips; otherwise one tip per
 * app first (so the three are from different apps), then any left over.
 */
export function pickTips(seed: string, count: number, app?: GuideApp): PickedTip[] {
  const all = (apps: readonly GuideApp[]) =>
    apps.flatMap((a) => APP_GUIDE[a].tips.map((t): PickedTip => ({ ...t, app: a })));
  if (app) return seededOrder(all([app]), seed).slice(0, count);
  const firstOfEach = seededOrder(
    GUIDE_APPS.filter((a) => a !== "hub").map((a) => seededOrder(all([a]), `${seed}:${a}`)[0]),
    seed,
  );
  const rest = seededOrder(
    all(GUIDE_APPS).filter((t) => !firstOfEach.some((f) => f.app === t.app && f.text === t.text)),
    `${seed}:rest`,
  );
  return [...firstOfEach, ...rest].slice(0, count);
}
