export interface CasinoGameRegistryItem {
  key: string;
  label: string;
  path: string;
  description: string;
}

// Add a new game by adding an entry here plus its own folder under games/ - nothing
// else in this file, or in any other game's files, needs to change.
export const CASINO_GAMES_REGISTRY: CasinoGameRegistryItem[] = [
  {
    key: "demo",
    label: "Demo Game",
    path: "/internal/xencasino/games/demo",
    description: "A placeholder game to try winning and losing cheddar.",
  },
  {
    key: "crash",
    label: "Crash",
    path: "/internal/xencasino/games/crash",
    description: "Cash out before it crashes. 1% house edge, no matter when you cash out.",
  },
  {
    key: "slots",
    label: "Slots",
    path: "/internal/xencasino/games/slots",
    description: "Spin the reels for a shot at the growing jackpot.",
  },
  {
    key: "scratch",
    label: "Scratch Ticket",
    path: "/internal/xencasino/games/scratch",
    description: "Buy a ticket, match three symbols to win up to 100x.",
  },
];
