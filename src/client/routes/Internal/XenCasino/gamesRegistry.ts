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
