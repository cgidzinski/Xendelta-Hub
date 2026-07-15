export type CasinoGameType = "slots" | "scratch";

export interface CasinoGameRegistryItem {
  key: string;
  label: string;
  path: string;
  description: string;
  type: CasinoGameType;
}

export const CASINO_GAME_TYPE_LABELS: Record<CasinoGameType, string> = {
  slots: "Slots",
  scratch: "Scratch Tickets",
};

// Add a new game by adding an entry here plus its own folder under games/ - nothing else
// in this file, or in any other game's files, needs to change. `type` groups variants
// together on the games list (e.g. a second scratch ticket joins the same "Scratch
// Tickets" section instead of getting its own).
export const CASINO_GAMES_REGISTRY: CasinoGameRegistryItem[] = [
  {
    key: "easy-spin",
    label: "Easy Spin",
    path: "/internal/xencasino/games/easy-spin",
    description: "500-credit machine - spin the reels for a shot at the growing jackpot.",
    type: "slots",
  },
  {
    key: "spinmania",
    label: "Spinmania",
    path: "/internal/xencasino/games/spinmania",
    description: "2000-credit high-roller machine with its own jackpot.",
    type: "slots",
  },
  {
    key: "easy-scratch",
    label: "Easy Scratch",
    path: "/internal/xencasino/games/easy-scratch",
    description: "500-cheddar ticket - scratch to match three symbols and win up to 100x.",
    type: "scratch",
  },
  {
    key: "scratchmania",
    label: "Scratchmania",
    path: "/internal/xencasino/games/scratchmania",
    description: "2000-cheddar high-roller ticket with rarer wins and a much bigger top prize.",
    type: "scratch",
  },
];
