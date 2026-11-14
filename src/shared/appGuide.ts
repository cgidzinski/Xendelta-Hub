// What each app is for, everything it can do, and short "did you know" tips. The About page shows the description and the
// feature list; the tips appear when the Home activity feed is empty. Written for people who are new here, not for developers: say what you can DO.
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
  /** One line that gets someone who doesn't use the app to try it ("Try XenNote for…"), with a link to open it. The hub has none. */
  pitch?: Tip;
  /** Everything a person can do in the app, one plain sentence each, most important first. Shown on the About page. */
  features: string[];
  /** Things worth knowing once you already use the app. Shown only to people who do. */
  tips: Tip[];
}

export const APP_GUIDE: Record<GuideApp, AppGuideEntry> = {
  hub: {
    about:
      "XenSuite is one place for the apps you share with the people around you. Your Home page shows what needs attention and what your people have been up to.",
    features: [
      "See what needs your attention, and what happened in your shared spaces, on one Home page.",
      "Pin the apps you use to the top of Home, with a count of what is waiting in each.",
      "Chat one to one or in groups, with photos, files, replies and reactions.",
      "Mention someone with @ so they are told even if they muted the chat, and see which channels name you.",
      "See a short preview of a web page when someone shares its link, and take it off your own message if you prefer.",
      "Format a message with bold, italic, strikethrough, code, quotes and lists, or hide a spoiler until it is clicked.",
      "Pick any emoji for a message or a reaction, with search, skin tones and the ones you used lately.",
      "Add your own emoji to a community or a group chat, and use them in messages and reactions.",
      "Make a community for a group, with its own channels, roles and people, and invite hub users to join.",
      "Make a channel private or read-only, and give people roles with the permissions you choose.",
      "Find the people you share groups, books and notebooks with, and message them.",
      "Get notifications on your phone or computer, and by email if you want them.",
      "Send a link, some text or a photo from your phone's Share button, then save it as a note, a short link, a file or the start of an expense.",
      "Choose a light or dark look and your timezone.",
      "Create keys so your own scripts or smart-home tools can use your account.",
      "Send feedback to the people who run it, and earn gems when a bug you report gets fixed.",
    ],
    tips: [
      {
        text: "Press Edit next to Pinned apps on Home to pin the apps you use. They show up at the top with a count of what is waiting.",
        link: "/internal",
      },
      {
        text: "Try Communities to chat with a group in separate channels. Use the invite button to ask people to join.",
        link: "/internal/communities",
      },
      {
        text: "Try typing @ and a name in a message to mention someone. They are told even if they muted the chat.",
        link: "/internal/messages",
      },
      {
        text: "Try putting ** around words to make them bold, or || around words to hide them as a spoiler.",
        link: "/internal/messages",
      },
      {
        text: "Try typing a colon and a word, like :smile, in a message. Pick an emoji from the list that appears.",
        link: "/internal/messages",
      },
      {
        text: "Open Messages to chat with a person or a group, and send photos in the conversation.",
        link: "/internal/messages",
      },
      {
        text: "Install XenSuite on your phone from your browser's menu to get it as an app, with reminders as notifications.",
        link: "/internal/profile",
      },
      { text: "Use your phone's Share button to send a link, some text or a photo straight to XenSuite." },
      {
        text: "Found a bug? Send feedback and describe what went wrong. If we fix it, you get gems as a thank you.",
        link: "/internal/feedback",
      },
    ],
  },
  recipaint: {
    about:
      "Recipaint is for keeping your paint recipes: the mixes, the images and the notes, so you can make the same colour again.",
    pitch: { text: "Try Recipaint to keep your paint recipes in one place.", link: "/internal/recipaint" },
    features: [
      "Keep paint recipes with a description, steps and the paints used in each step.",
      "Add photos to a recipe and flip through them.",
      "Mark which paints you own, from a built-in catalogue or your own custom paints.",
      "Paint along: follow a recipe one step at a time, with big images, the paints for that step and a progress bar.",
      "Make a recipe public, or keep it private.",
      "Browse public recipes from other people and make your own copy to edit.",
      "Search, filter and sort your recipes.",
      "See every paint a recipe needs in one list, which works as a shopping list.",
    ],
    tips: [
      { text: "Add photos to a recipe so you can see the result next to the mix.", link: "/internal/recipaint" },
      { text: "Look through the public recipes for ideas from other people.", link: "/internal/recipaint" },
    ],
  },
  xendrive: {
    about:
      "XenDrive is your file storage: put files in folders, preview them, and share a file or a whole folder with a link.",
    pitch: { text: "Try XenDrive to store your files and share them with a link.", link: "/internal/xendrive" },
    features: [
      "Upload files by choosing them or dragging them in. Big files upload in pieces, with progress shown.",
      "Organize files in folders.",
      "Preview images, PDFs, video and audio without downloading them.",
      "Share a file with a link, with an optional password and expiry date.",
      "Share a whole folder with a link that anyone can browse without an account.",
      "See how many times a shared file or folder was downloaded.",
      "Search your drive and filter by type or link status.",
      "Switch between list and grid view, and act on several items at once.",
      "See the files other apps saved for you, and how much storage you have used.",
      "Rename, move, download and delete files and folders.",
    ],
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
    pitch: { text: "Try XenLink to make a short link and see how often it is opened.", link: "/internal/xenlink" },
    features: [
      "Turn a long web address into a short link you can send to people.",
      "Choose your own short name, like /x/summer-party, or get a random one.",
      "Set a date when a link stops working.",
      "Open a link's QR code to show or print it.",
      "See how many times a link was opened, when it was last opened, and a day-by-day chart.",
      "Edit, search and delete your links.",
    ],
    tips: [
      { text: "Choose your own short name, like /x/summer-party, instead of a random one.", link: "/internal/xenlink" },
      { text: "Give a link an expiry date so it stops working on its own.", link: "/internal/xenlink" },
      { text: "Open a link's QR code to print it or show it on a screen.", link: "/internal/xenlink" },
    ],
  },
  xensplit: {
    about: "XenSplit keeps track of who paid for what in a group, and works out who owes whom so you can settle up.",
    pitch: { text: "Try XenSplit to keep track of who paid for what in a group.", link: "/internal/xensplit" },
    features: [
      "Create groups for trips, households or friends, and add the people in them.",
      "Add expenses with who paid, and split them equally, by exact amounts or by percentage.",
      "Attach receipt photos to an expense.",
      "Use several currencies in one group, with balances kept separate for each.",
      "Record a currency exchange between two people so balances stay right.",
      "Set up recurring expenses that repeat daily, weekly, monthly or yearly, and pause them.",
      "See who owes whom, and the fewest payments that settle everyone up.",
      "Record settlements, with a prompt to pay by e-transfer.",
      "See a map of who owes what to whom, simplified or direct.",
      "See spending by category, by member and by month.",
      "Look back through the group's activity and restore deleted expenses.",
      "Start an expense from a receipt photo shared from your phone.",
    ],
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
    pitch: { text: "Try XenBudget to see where your money goes.", link: "/internal/xenbudget" },
    features: [
      "Keep budget books you share with other people.",
      "Log money in and out with a date, amount, note and receipt photos.",
      "Sort items with categories and flags, and share an item between people.",
      "Search, filter and review items by period, category, flag or person.",
      "Set budgets per category, with shared and per-person limits and a projection of where you will end up.",
      "See where the money goes in an overview and a report, and export the report to CSV.",
      "Import a bank CSV with guided column mapping, duplicate skipping and undo.",
      "Make rules that categorise or flag items automatically.",
      "Save towards a goal with piggy banks.",
      "See recurring charges that were found for you.",
      "Back up a book to a file and restore it.",
      "Start an item from a receipt photo shared from your phone.",
    ],
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
    pitch: { text: "Try XenRoutine to get reminded about things you do on a schedule.", link: "/internal/xenroutine" },
    features: [
      "Make routines for things you do on a schedule: every few days, weeks, months or years.",
      "See what is overdue, due soon and coming up, and choose how far ahead to look.",
      "Slide to mark a routine done, or add a note and photos about what you did.",
      "Give a routine a checklist of steps to tick off.",
      "Get reminders in the app, by push or by email, with a heads-up before it is due and nudges while it is overdue.",
      "Share a routine so anyone in it can mark it done.",
      "Postpone a routine by a day, a week or more.",
      "See each routine's history with its notes and photos.",
      "Pause, edit or delete a routine.",
    ],
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
    pitch: { text: "Try XenKitchen to plan the week's meals and get a shopping list.", link: "/internal/xenkitchen" },
    features: [
      "Keep recipe books, and share them with others as editors or viewers.",
      "Write recipes with photos, tags, times, servings, ingredient sections and steps with timers.",
      "Import a recipe from a web address.",
      "Scale the servings and switch between metric and US units.",
      "Cook one step at a time in big text, with timers and the screen kept awake.",
      "Plan meals week by week.",
      "Get a shopping list for the planned meals with the ingredients added up, and send it to XenNote to tick off in the shop.",
      "Organize recipes with categories and tags, and mark favourites.",
      "Search and filter recipes by favourite, tag or ingredient.",
      "Share a recipe or a whole book with a link anyone can read.",
      "Copy or move a recipe between books.",
    ],
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
    pitch: { text: "Try XenNote for quick notes and checklists you can share.", link: "/internal/xennote" },
    features: [
      "Write notes, checklists and link notes.",
      "Format notes with Markdown and preview them.",
      "Link one note to another by typing its name in double square brackets, and see which notes link back.",
      "Tick checklist items right from the board, and drag them to reorder.",
      "Add photos to a note.",
      "Pin, archive, colour and label notes.",
      "Group notes in notebooks and share them with people as editors or viewers.",
      "Share a note or a notebook with a link anyone can open.",
      "Set a reminder on a note and get a notification when it is due.",
      "Search and filter by type, label or notebook.",
    ],
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
  /** "try": an invitation to start using an app. "feature": something worth knowing about an app already in use. */
  kind: "try" | "feature";
}

export interface TipOptions {
  /** The apps this person already uses. */
  used?: ReadonlySet<string>;
  /** Only tips about this app (the feed is filtered to it). */
  app?: GuideApp;
}

/**
 * Up to `count` tips for the "did you know" block. They push people towards apps they don't use yet: one invitation per such
 * app comes first. Tips about how to get more out of an app are only for people who already use it (and the hub-wide ones), and
 * fill what is left. The same `seed` (use today's date) gives the same tips, so they stay put while someone is on the page
 * and change from day to day.
 */
export function pickTips(seed: string, count: number, { used = new Set(), app }: TipOptions = {}): PickedTip[] {
  const invite = (a: GuideApp): PickedTip[] =>
    APP_GUIDE[a].pitch ? [{ ...APP_GUIDE[a].pitch!, app: a, kind: "try" }] : [];
  const features = (a: GuideApp): PickedTip[] => APP_GUIDE[a].tips.map((t) => ({ ...t, app: a, kind: "feature" }));

  if (app) return (app === "hub" || used.has(app) ? seededOrder(features(app), seed) : invite(app)).slice(0, count);

  const apps = GUIDE_APPS.filter((a) => a !== "hub");
  const invitations = seededOrder(
    apps.filter((a) => !used.has(a)),
    seed,
  ).flatMap(invite);
  const inUse = GUIDE_APPS.filter((a) => a === "hub" || used.has(a));
  const oneFeatureEach = seededOrder(inUse, `${seed}:in-use`).flatMap((a) =>
    seededOrder(features(a), `${seed}:${a}`).slice(0, 1),
  );
  return [...invitations, ...oneFeatureEach].slice(0, count);
}
