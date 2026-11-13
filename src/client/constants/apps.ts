import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import BrushIcon from "@mui/icons-material/Brush";
import FolderIcon from "@mui/icons-material/Folder";
import LinkIcon from "@mui/icons-material/Link";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import StickyNote2Icon from "@mui/icons-material/StickyNote2";

export interface AppRegistryItem {
  key: string;
  label: string;
  icon: React.ElementType;
  path: string;
  description: string;
}

/** What is pinned when nothing is: someone who has pinned nothing (or everything was unpinned) still sees these three. */
export const DEFAULT_PINNED_APPS = ["xensplit", "xennote", "xenkitchen"];

export const resolvePinnedApps = (pinnedApps: string[] | null | undefined): string[] =>
  pinnedApps && pinnedApps.length > 0 ? pinnedApps : DEFAULT_PINNED_APPS;

/** The pinned list after pinning an app that isn't pinned (added at the end) or unpinning one that is. */
export const toggledPins = (pinned: string[], key: string): string[] =>
  pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];

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
    description: "Store files in folders and share them",
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
    label: "XenSplit",
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
  {
    key: "xennote",
    label: "XenNote",
    icon: StickyNote2Icon,
    path: "/internal/xennote",
    description: "Quick notes, lists, photos and links, in notebooks you can share",
  },
];
