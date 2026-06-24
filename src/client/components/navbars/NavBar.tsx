import HomeIcon from "@mui/icons-material/Home";
import ArticleIcon from "@mui/icons-material/Article";
import SecurityIcon from "@mui/icons-material/Security";
import InventoryIcon from "@mui/icons-material/Inventory2";
import EditIcon from "@mui/icons-material/Edit";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import { APPS_REGISTRY, AppRegistryItem, resolvePinnedApps } from "../../constants/apps";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { Link } from "react-router-dom";
import { useNavBar } from "../../contexts/NavBarContext";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import { usePinnedApps } from "../../hooks/user/usePinnedApps";
import BaseNavBar, { NavItem } from "./BaseNavBar";

// APPS_REGISTRY now imported from constants/apps.ts

export default function Root() {
  const { isNavBarOpen, toggleNavBar, title } = useNavBar();
  const { profile } = useUserProfile();
  const { togglePinnedApp, isUpdating } = usePinnedApps();

  const pinnedApps = resolvePinnedApps(profile?.pinnedApps);

  const buildPinAction = (app: AppRegistryItem, isPinned: boolean): React.ReactNode => (
    <Tooltip title={isPinned ? "Unpin" : "Pin"}>
      <span>
        <IconButton
          edge="end"
          size="small"
          disabled={isUpdating}
          onClick={() => togglePinnedApp(app.key, pinnedApps)}
          aria-label={isPinned ? `Unpin ${app.label}` : `Pin ${app.label}`}
          sx={{ color: isPinned ? "warning.main" : "action.active" }}
        >
          {isPinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );

  const buildAppNavItem = (app: AppRegistryItem, keyPrefix: string): NavItem => ({
    key: `${keyPrefix}-${app.key}`,
    label: app.label,
    icon: app.icon ? <app.icon sx={{ fontSize: 22 }} /> : undefined,
    path: app.path,
    isSelected: (pathname: string) => pathname.startsWith(app.path),
    endAction: buildPinAction(app, pinnedApps.includes(app.key)),
  });

  const pinnedNavItems: NavItem[] = pinnedApps
    .map((appKey) => {
      const app = APPS_REGISTRY.find((a) => a.key === appKey);
      return app ? buildAppNavItem(app, "pinned") : null;
    })
    .filter(Boolean) as NavItem[];

  const allAppNavItems: NavItem[] = APPS_REGISTRY
    .filter((app) => !pinnedApps.includes(app.key))
    .map((app) => buildAppNavItem(app, "app"));

  const pinnedSection: NavItem[] = pinnedNavItems.length
    ? [
      {
        key: "pinned-apps-header",
        label: "Pinned Apps",
        icon: null,
        path: "",
        isSelected: () => false,
        type: "header" as const,
      },
      ...pinnedNavItems,
    ]
    : [];

  const navItems: NavItem[] = [
    {
      key: "home",
      label: "Home",
      icon: <HomeIcon />,
      path: "/internal",
      isSelected: (pathname) => pathname === "/internal" || pathname === "/internal/",
    },
    // {
    //   key: "blog",
    //   label: "Blog",
    //   icon: <ArticleIcon />,
    //   path: "/internal/blog",
    //   isSelected: (pathname) => pathname.startsWith("/internal/blog"),
    // },
    // {
    //   key: "inventory",
    //   label: "Inventory",
    //   icon: <InventoryIcon />,
    //   path: "/internal/inventory",
    //   isSelected: (pathname) => pathname.startsWith("/internal/inventory"),
    // },
    ...(pinnedNavItems.length > 0 || allAppNavItems.length > 0
      ? [
        {
          key: "apps-divider",
          label: "",
          icon: null,
          path: "",
          isSelected: () => false,
          type: "divider" as const,
        },
      ]
      : []),
    ...pinnedSection,
    ...(allAppNavItems.length > 0
      ? [
        {
          key: "apps-header",
          label: "Apps",
          icon: null,
          path: "",
          isSelected: () => false,
          type: "header" as const,
        },
      ]
      : []),
  ];

  const footerNavItems: NavItem[] = [];

  const isAdmin = profile?.roles?.some((role: string) => role.toLowerCase() === "admin");

  return (
    <BaseNavBar
      title={title}
      isNavBarOpen={isNavBarOpen}
      onToggleNavBar={toggleNavBar}
      navItems={navItems}
      scrollableNavItems={allAppNavItems}
      footerNavItems={footerNavItems}
      showNotifications={true}
      showMessages={false}
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
