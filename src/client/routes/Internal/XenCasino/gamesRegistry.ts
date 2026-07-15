export type CasinoGameType = "crash" | "slots" | "scratch" | "practice";

export interface CasinoGameRegistryItem {
  key: string;
  label: string;
  path: string;
  description: string;
  type: CasinoGameType;
}

export const CASINO_GAME_TYPE_LABELS: Record<CasinoGameType, string> = {
  crash: "Crash",
  slots: "Slots",
  scratch: "Scratch Tickets",
  practice: "Practice",
};

// Add a new game by adding an entry here plus its own folder under games/ - nothing else
// in this file, or in any other game's files, needs to change. `type` groups variants
// together on the games list (e.g. a second scratch ticket joins the same "Scratch
// Tickets" section instead of getting its own).
export const CASINO_GAMES_REGISTRY: CasinoGameRegistryItem[] = [
  {
    key: "demo",
    label: "Demo Game",
    path: "/internal/xencasino/games/demo",
    description: "A placeholder game to try winning and losing cheddar.",
    type: "practice",
  },
  {
    key: "crash",
    label: "Crash",
    path: "/internal/xencasino/games/crash",
    description: "Cash out before it crashes — the longer you wait, the bigger the multiplier.",
    type: "crash",
  },
  {
    key: "slots",
    label: "Slots",
    path: "/internal/xencasino/games/slots",
    description: "Spin the reels for a shot at the growing jackpot.",
    type: "slots",
  },
  {
    key: "scratch",
    label: "Scratch Ticket",
    path: "/internal/xencasino/games/scratch",
    description: "Buy a ticket, match three symbols to win up to 100x.",
    type: "scratch",
  },
];
