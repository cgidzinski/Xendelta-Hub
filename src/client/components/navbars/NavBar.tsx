import HomeIcon from "@mui/icons-material/Home";
import ArticleIcon from "@mui/icons-material/Article";
import SettingsIcon from "@mui/icons-material/Settings";
import SecurityIcon from "@mui/icons-material/Security";
import InventoryIcon from "@mui/icons-material/Inventory2";
import BrushIcon from "@mui/icons-material/Brush";
import FolderIcon from "@mui/icons-material/Folder";
import LinkIcon from "@mui/icons-material/Link";
import EditIcon from "@mui/icons-material/Edit";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import IconButton from "@mui/material/IconButton";
import { Link } from "react-router-dom";
import { useNavBar } from "../../contexts/NavBarContext";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import BaseNavBar, { NavItem } from "./BaseNavBar";

const APPS_REGISTRY = {
  recipaint: { label: "Recipaint", icon: <BrushIcon />, path: "/internal/recipaint" },
  xenbox: { label: "XenBox", icon: <FolderIcon />, path: "/internal/xenbox" },
  xenlink: { label: "XenLink", icon: <LinkIcon />, path: "/internal/xenlink" },
  xensplit: { label: "Xensplit", icon: <ReceiptLongIcon />, path: "/internal/xensplit" },
};

export default function Root() {
  const { isNavBarOpen, toggleNavBar, title } = useNavBar();
  const { profile } = useUserProfile();

  const pinnedApps = profile?.pinnedApps || [];

  const appNavItems: NavItem[] = pinnedApps.map((appKey) => {
    const app = APPS_REGISTRY[appKey as keyof typeof APPS_REGISTRY];
    if (!app) return null;
    return {
      key: `pinned-${appKey}`,
      label: app.label,
      icon: app.icon,
      path: app.path,
      isSelected: (pathname: string) => pathname.startsWith(app.path),
    };
  }).filter(Boolean) as NavItem[];

  const navItems: NavItem[] = [
    {
      key: "home",
      label: "Home",
      icon: <HomeIcon />,
      path: "/internal",
      isSelected: (pathname) => pathname === "/internal" || pathname === "/internal/",
    },
    {
      key: "blog",
      label: "Blog",
      icon: <ArticleIcon />,
      path: "/internal/blog",
      isSelected: (pathname) => pathname.startsWith("/internal/blog"),
    },
    {
      key: "apps-divider",
      label: "",
      icon: null,
      path: "",
      isSelected: () => false,
      type: "divider" as const,
    },
    {
      key: "apps-header",
      label: "Apps",
      icon: null,
      path: "",
      isSelected: () => false,
      type: "header" as const,
      headerAction: (
        <Link to="/internal/apps" style={{ color: "inherit", display: "flex" }}>
          <IconButton size="small" sx={{ color: "text.secondary" }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Link>
      ),
    },
    ...appNavItems,
  ];

  const footerNavItems: NavItem[] = [
    {
      key: "inventory",
      label: "Inventory",
      icon: <InventoryIcon />,
      path: "/internal/inventory",
      isSelected: (pathname) => pathname.startsWith("/internal/inventory"),
    },
    {
      key: "settings",
      label: "Settings",
      icon: <SettingsIcon />,
      path: "/internal/settings",
      isSelected: (pathname) => pathname.endsWith("/internal/settings"),
    },
  ];

  const isAdmin = profile?.roles?.some((role: string) => role.toLowerCase() === "admin");

  return (
    <BaseNavBar
      title={title}
      isNavBarOpen={isNavBarOpen}
      onToggleNavBar={toggleNavBar}
      navItems={navItems}
      footerNavItems={footerNavItems}
      showNotifications={true}
      showMessages={true}
      showPoints={true}
    >
      {isAdmin && (
        <Link to="/admin" style={{ color: "inherit", display: "flex", marginLeft: 4 }}>
          <IconButton
            sx={{
              color: "warning.main",
              backgroundColor: "rgba(255, 193, 7, 0.1)",
              "&:hover": {
                backgroundColor: "rgba(255, 193, 7, 0.2)",
              },
            }}
          >
            <SecurityIcon />
          </IconButton>
        </Link>
      )}
    </BaseNavBar>
  );
}
