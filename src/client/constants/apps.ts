import BrushIcon from "@mui/icons-material/Brush";
import FolderIcon from "@mui/icons-material/Folder";
import LinkIcon from "@mui/icons-material/Link";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";

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
        key: "xenbox",
        label: "XenBox",
        icon: FolderIcon,
        path: "/internal/xenbox",
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
    // XenCasino hidden from side nav
    // {
    //     key: "xencasino",
    //     label: "XenCasino",
    //     icon: CasinoIcon,
    //     path: "/internal/xencasino",
    //     description: "Play casino games with your Weeabets cheddar",
    // },
];
