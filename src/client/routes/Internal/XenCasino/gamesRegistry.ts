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
];
