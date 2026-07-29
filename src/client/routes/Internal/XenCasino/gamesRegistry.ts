export type CasinoGameType = "slots" | "scratch" | "plinko" | "pachinko" | "memory" | "garden" | "printer" | "mine";

export interface CasinoGameRegistryItem {
  key: string;
  label: string;
  path: string;
  description: string;
  type: CasinoGameType;
  price: number; // fixed ticket price, or a slot machine's base (1x) bet
  // True for the persistent games (Garden/Printer/Mine), where `price` is only the
  // cheapest way in (e.g. Garden's cheapest seed) rather than a fixed per-play cost -
  // rendered as "X+ / play" instead of "X / play" so it doesn't read as a flat price.
  priceFrom?: boolean;
}

export const CASINO_GAME_TYPE_LABELS: Record<CasinoGameType, string> = {
  slots: "Slots",
  scratch: "Scratch Tickets",
  plinko: "Plinko",
  pachinko: "Pachinko",
  memory: "Memory",
  garden: "Garden",
  printer: "Printing",
  mine: "Mining",
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
  {
    key: "pachinko",
    label: "Pachinko",
    path: "/internal/xencasino/games/pachinko",
    description: "100-cheddar balls, sold in batches - launch them into the pin field for a shot at the jackpot pool.",
    type: "pachinko",
    price: 100,
  },
  {
    key: "memory",
    label: "Memory",
    path: "/internal/xencasino/games/memory",
    description: "10,000-cheddar round - shuffle the grid and find matching pairs in 3 tries for a prize.",
    type: "memory",
    price: 10000,
  },
  {
    key: "garden",
    label: "Casino Garden",
    path: "/internal/xencasino/games/garden",
    description: "Plant seeds across a 3x3 grid - water daily, guard against vermin and disease, and harvest for a payout.",
    type: "garden",
    price: 1000, // cheapest seed (Sprout) - see SEED_TIERS in casinoGarden.ts
    priceFrom: true,
  },
  {
    key: "printer",
    label: "Money Printer",
    path: "/internal/xencasino/games/printer",
    description: "Install up to 3 parts and start a print run - let it age for a bigger payout, or cash out before rising raid risk seizes your rig.",
    type: "printer",
    price: 5000, // roughly the cheapest 3-part run (3x Case Fan = 4800) - see PRINTER_PARTS in casinoPrinter.ts
    priceFrom: true,
  },
  {
    key: "mine",
    label: "Chip Mine",
    path: "/internal/xencasino/games/mine",
    description: "Dig a dark shaft for ore - down is riskier, sideways stays safe. Limited digs per day, buy ladders and torches.",
    type: "mine",
    price: 200,
    priceFrom: true,
  },
];
