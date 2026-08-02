import easySpinIcon from "./icons/easyspin.jpg";
import spinmaniaIcon from "./icons/spinmania.jpg";
import kittyScratchIcon from "./icons/kittyscratch.jpg";
import crosswordIcon from "./icons/crossword.jpg";
import plinkoIcon from "./icons/plinko.jpg";
import pachinkoIcon from "./icons/pachinko.jpg";
import memoryIcon from "./icons/memory.jpg";
import printerIcon from "./icons/printer.jpg";
import cheddarRanchIcon from "./icons/cheddarranch.jpg";

export type CasinoGameType = "slots" | "scratch" | "plinko" | "pachinko" | "memory" | "printer" | "ranch";

export interface CasinoGameRegistryItem {
  key: string;
  label: string;
  path: string;
  description: string;
  type: CasinoGameType;
  icon: string;
  price: number; // fixed ticket price, or a slot machine's base (1x) bet
  // True for the persistent games (Garden/Printer/Mine), where `price` is only the
  // cheapest way in (e.g. Garden's cheapest seed) rather than a fixed per-play cost -
  // rendered as "X+ / play" instead of "X / play" so it doesn't read as a flat price.
  priceFrom?: boolean;
  // True for the persistent games you check in on over time (Printer/Ranch) - the games
  // list splits these into their own "Daily Games" section, above the unlimited-play
  // "Casino Games" below.
  dailyGame?: boolean;
}

export const CASINO_GAME_TYPE_LABELS: Record<CasinoGameType, string> = {
  slots: "Slots",
  scratch: "Scratch Tickets",
  plinko: "Plinko",
  pachinko: "Pachinko",
  memory: "Memory",
  printer: "Printing",
  ranch: "Creature Ranch",
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
    icon: easySpinIcon,
    price: 5000,
  },
  {
    key: "spinmania",
    label: "Spinmania",
    path: "/internal/xencasino/games/spinmania",
    description: "20,000-credit high-roller machine with its own jackpot.",
    type: "slots",
    icon: spinmaniaIcon,
    price: 20000,
  },
  {
    key: "kitty-scratch",
    label: "Kitty Scratch",
    path: "/internal/xencasino/games/kitty-scratch",
    description: "5,000-cheddar ticket - scratch the whole card to reveal your prize.",
    type: "scratch",
    icon: kittyScratchIcon,
    price: 5000,
  },
  {
    key: "crossword",
    label: "Crossword",
    path: "/internal/xencasino/games/crossword",
    description: "20,000-cheddar high-roller ticket - spell hidden words with your letters for big prizes.",
    type: "scratch",
    icon: crosswordIcon,
    price: 20000,
  },
  {
    key: "plinko",
    label: "Plinko",
    path: "/internal/xencasino/games/plinko",
    description: "500-cheddar base bet - drop a ball through 12 rows of pegs for a shot at a 2.48x edge slot.",
    type: "plinko",
    icon: plinkoIcon,
    price: 500,
  },
  {
    key: "pachinko",
    label: "Pachinko",
    path: "/internal/xencasino/games/pachinko",
    description: "100-cheddar balls, sold in batches - launch them into the pin field for a shot at the jackpot pool.",
    type: "pachinko",
    icon: pachinkoIcon,
    price: 100,
  },
  {
    key: "memory",
    label: "Memory",
    path: "/internal/xencasino/games/memory",
    description: "2,500-cheddar round — flip 2 cards at a time over 3 tries, matching pairs win prizes.",
    type: "memory",
    icon: memoryIcon,
    price: 2500,
  },
  {
    key: "printer",
    label: "Money Printer",
    path: "/internal/xencasino/games/printer",
    description: "Install up to 3 parts and start a print run — let it age for a bigger payout, or cash out before raid risk (5%→40% over 2h, per 5-min roll) seizes your rig.",
    type: "printer",
    icon: printerIcon,
    price: 5000, // roughly the cheapest 3-part run (3x Case Fan = 4800) - see PRINTER_PARTS in casinoPrinter.ts
    priceFrom: true,
    dailyGame: true,
  },
  {
    key: "cheddar-ranch",
    label: "Cheddar Ranch",
    path: "/internal/xencasino/games/cheddar-ranch",
    description: "Hatch and race creatures, dig the mines for ore, and grow crops in the garden — one ranch, four ways to earn.",
    type: "ranch",
    icon: cheddarRanchIcon,
    price: 2000, // hatch price - see HATCH_PRICE in casinoRanch.ts
    priceFrom: true,
    dailyGame: true,
  },
];
