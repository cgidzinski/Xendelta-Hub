import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import BrushIcon from "@mui/icons-material/Brush";
import FolderIcon from "@mui/icons-material/Folder";
import LinkIcon from "@mui/icons-material/Link";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";

export interface AppRegistryItem {
  key: string;
  label: string;
  icon: React.ElementType;
  path: string;
  description: string;
}

// TEMP: default xensplit to pinned for existing users with no pins yet.
// Remove this (and its call sites) once a proper default is in place.
export const resolvePinnedApps = (pinnedApps: string[] | undefined): string[] =>
  pinnedApps && pinnedApps.length > 0 ? pinnedApps : ["xensplit"];

export const APPS_REGISTRY: AppRegistryItem[] = [
  {
    key: "recipaint",
    label: "Recipaint",
    icon: BrushIcon,
    path: "/internal/recipaint",
    description: "Create and manage your recipes",
  },
  {
    key: "xendrive",
    label: "XenDrive",
    icon: FolderIcon,
    path: "/internal/xendrive",
    description: "Store and share your files",
  },
  {
    key: "xenlink",
    label: "XenLink",
    icon: LinkIcon,
    path: "/internal/xenlink",
    description: "Shorten and manage your links",
  },
  {
    key: "xensplit",
    label: "Xensplit",
    icon: ReceiptLongIcon,
    path: "/internal/xensplit",
    description: "Split expenses with friends",
  },
  {
    key: "xenbudget",
    label: "XenBudget",
    icon: AccountBalanceWalletIcon,
    path: "/internal/xenbudget",
    description: "Track spending and set budgets",
  },
  {
    key: "xenroutine",
    label: "XenRoutine",
    icon: EventRepeatIcon,
    path: "/internal/xenroutine",
    description: "Get reminded of recurring chores like filters and oil changes",
  },
  {
    key: "xenkitchen",
    label: "XenKitchen",
    icon: RestaurantMenuIcon,
    path: "/internal/xenkitchen",
    description: "Save recipes and the cooking instructions off the box",
  },
];
