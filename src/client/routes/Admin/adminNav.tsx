import type { ReactNode } from "react";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import HistoryIcon from "@mui/icons-material/History";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";

export interface AdminNavItem {
  key: string;
  label: string;
  path: string;
  icon: ReactNode;
  /** The group it sits under in the sidebar. */
  group?: string;
  /** Also on the phone's bottom bar. */
  phone?: boolean;
  /** Active for this path and everything under it. */
  prefix?: boolean;
}

/** The admin sections, in sidebar order. A group heading is drawn above the first item that has one. */
export const ADMIN_NAV: AdminNavItem[] = [
  { key: "overview", label: "Overview", path: "/admin", icon: <DashboardOutlinedIcon fontSize="small" />, phone: true },
  {
    key: "users",
    label: "Users",
    path: "/admin/users",
    icon: <PeopleOutlineIcon fontSize="small" />,
    group: "People",
    phone: true,
    prefix: true,
  },
  {
    key: "feedback",
    label: "Feedback",
    path: "/admin/feedback",
    icon: <FeedbackOutlinedIcon fontSize="small" />,
  },
  {
    key: "blog",
    label: "Blog",
    path: "/admin/blog",
    icon: <ArticleOutlinedIcon fontSize="small" />,
    group: "Content",
    prefix: true,
  },
  {
    key: "money",
    label: "Shop and payments",
    path: "/admin/money",
    icon: <CreditCardOutlinedIcon fontSize="small" />,
    group: "Money",
  },
  {
    key: "storage",
    label: "Storage",
    path: "/admin/storage",
    icon: <StorageOutlinedIcon fontSize="small" />,
    group: "Platform",
  },
  { key: "messaging", label: "Messaging", path: "/admin/messaging", icon: <NotificationsNoneIcon fontSize="small" /> },
  { key: "system", label: "System", path: "/admin/system", icon: <DnsOutlinedIcon fontSize="small" />, phone: true },
  {
    key: "audit",
    label: "Audit log",
    path: "/admin/audit",
    icon: <HistoryIcon fontSize="small" />,
    group: "Accountability",
    phone: true,
  },
];

export const isNavActive = (item: AdminNavItem, pathname: string) =>
  item.prefix ? pathname === item.path || pathname.startsWith(`${item.path}/`) : pathname === item.path;
