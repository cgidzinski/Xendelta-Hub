export type CasinoGameType = "slots" | "scratch" | "plinko";

export interface CasinoGameRegistryItem {
  key: string;
  label: string;
  path: string;
  description: string;
  type: CasinoGameType;
  price: number; // fixed ticket price, or a slot machine's base (1x) bet
}

export const CASINO_GAME_TYPE_LABELS: Record<CasinoGameType, string> = {
  slots: "Slots",
  scratch: "Scratch Tickets",
  plinko: "Plinko",
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
    description: "5,000-credit machine - spin the reels for a shot at the growing jackpot.",
    type: "slots",
    price: 5000,
  },
  {
    key: "spinmania",
    label: "Spinmania",
    path: "/internal/xencasino/games/spinmania",
    description: "20,000-credit high-roller machine with its own jackpot.",
    type: "slots",
    price: 20000,
  },
  {
    key: "kitty-scratch",
    label: "Kitty Scratch",
    path: "/internal/xencasino/games/kitty-scratch",
    description: "5,000-cheddar ticket - scratch the whole card to reveal your prize.",
    type: "scratch",
    price: 5000,
  },
  {
    key: "crossword",
    label: "Crossword",
    path: "/internal/xencasino/games/crossword",
    description: "20,000-cheddar high-roller ticket - spell hidden words with your letters for big prizes.",
    type: "scratch",
    price: 20000,
  },
  {
    key: "plinko",
    label: "Plinko",
    path: "/internal/xencasino/games/plinko",
    description: "500-cheddar base bet - drop a ball through 12 rows of pegs for a shot at an 18.6x edge slot.",
    type: "plinko",
    price: 500,
  },
];
