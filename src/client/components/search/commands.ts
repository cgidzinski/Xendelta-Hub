import type { ElementType } from "react";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import { APPS_REGISTRY } from "../../constants/apps";

// "Go to" commands for the palette: every app, and the hub's own pages. Matching is by words, so "split exp" finds
// XenSplit but "exp split" does too.
export interface Command {
  id: string;
  label: string;
  /** Other words that find it ("billing" finds Billing and gems). */
  keywords?: string;
  path: string;
  icon: ElementType;
}

export const COMMANDS: Command[] = [
  { id: "home", label: "Home", path: "/internal", icon: HomeOutlinedIcon },
  {
    id: "chat",
    label: "Chat",
    keywords: "messages dm direct conversations communities",
    path: "/internal/chat",
    icon: ChatBubbleOutlineIcon,
  },
  {
    id: "notifications",
    label: "Notifications",
    keywords: "inbox alerts",
    path: "/internal/notifications",
    icon: NotificationsNoneIcon,
  },
  {
    id: "people",
    label: "People",
    keywords: "friends find users contacts",
    path: "/internal/people",
    icon: PeopleOutlineIcon,
  },
  ...APPS_REGISTRY.map((a) => ({
    id: `app:${a.key}`,
    label: a.label,
    keywords: a.description,
    path: a.path,
    icon: a.icon,
  })),
  {
    id: "settings",
    label: "Settings",
    keywords: "profile account email timezone theme appearance security",
    path: "/internal/settings",
    icon: SettingsOutlinedIcon,
  },
  {
    id: "billing",
    label: "Billing",
    keywords: "gems usage statement cost",
    path: "/internal/billing",
    icon: ReceiptOutlinedIcon,
  },
  {
    id: "shop",
    label: "Shop",
    keywords: "buy gems badges frames inventory",
    path: "/internal/shop",
    icon: StorefrontOutlinedIcon,
  },
  {
    id: "feedback",
    label: "Send feedback",
    keywords: "bug idea suggestion",
    path: "/internal/feedback",
    icon: FeedbackOutlinedIcon,
  },
];

/** The commands whose label or keywords contain every word typed (all of them for an empty query). */
export function matchCommands(query: string, commands: Command[] = COMMANDS): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return (
    commands
      .filter((c) => {
        const hay = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      // A label that starts with what was typed comes before one that only mentions it in its keywords.
      .sort(
        (a, b) =>
          Number(b.label.toLowerCase().startsWith(words[0])) - Number(a.label.toLowerCase().startsWith(words[0])),
      )
  );
}
