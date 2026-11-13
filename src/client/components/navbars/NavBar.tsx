import { alpha } from "@mui/material/styles";
import HomeIcon from "@mui/icons-material/Home";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import InventoryIcon from "@mui/icons-material/Inventory2Outlined";
import SecurityIcon from "@mui/icons-material/Security";
import { APPS_REGISTRY, AppRegistryItem, resolvePinnedApps } from "../../constants/apps";
import IconButton from "@mui/material/IconButton";
import { Link, useLocation } from "react-router-dom";
import Chip from "@mui/material/Chip";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import { useWhatsNew } from "../../hooks/useWhatsNew";
import { useNavBar } from "../../contexts/NavBarContext";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import BaseNavBar, { NavItem } from "./BaseNavBar";

// APPS_REGISTRY now imported from constants/apps.ts

export default function Root() {
  const { isNavBarOpen, toggleNavBar, title } = useNavBar();
  const { profile } = useUserProfile();

  const pinnedApps = resolvePinnedApps(profile?.pinnedApps);

  const buildAppNavItem = (app: AppRegistryItem, keyPrefix: string): NavItem => ({
    key: `${keyPrefix}-${app.key}`,
    label: app.label,
    icon: app.icon ? <app.icon sx={{ fontSize: 22 }} /> : undefined,
    path: app.path,
    isSelected: (pathname: string) => pathname.startsWith(app.path),
  });

  const pinnedNavItems: NavItem[] = pinnedApps
    .map((appKey) => {
      const app = APPS_REGISTRY.find((a) => a.key === appKey);
      return app ? buildAppNavItem(app, "pinned") : null;
    })
    .filter(Boolean) as NavItem[];

  const allAppNavItems: NavItem[] = APPS_REGISTRY.filter((app) => !pinnedApps.includes(app.key)).map((app) =>
    buildAppNavItem(app, "app"),
  );

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
    {
      key: "people",
      label: "People",
      icon: <PeopleOutlineIcon />,
      path: "/internal/people",
      isSelected: (pathname) => pathname.startsWith("/internal/people"),
    },
    // {
    //   key: "blog",
    //   label: "Blog",
    //   icon: <ArticleIcon />,
    //   path: "/internal/blog",
    //   isSelected: (pathname) => pathname.startsWith("/internal/blog"),
    // },
    {
      key: "inventory",
      label: "Inventory",
      icon: <InventoryIcon />,
      path: "/internal/inventory",
      isSelected: (pathname) => pathname.startsWith("/internal/inventory"),
    },
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

  // Where the person is, so feedback can say which page it was about.
  const { pathname, search } = useLocation();
  const { unseen } = useWhatsNew();
  const here = encodeURIComponent(`${pathname}${search}`);
  const footerNavItems: NavItem[] = [
    {
      key: "whats-new",
      label: "What's new",
      icon: <CampaignOutlinedIcon />,
      path: "/internal/whats-new",
      isSelected: (p) => p.startsWith("/internal/whats-new"),
      endAction: unseen > 0 ? <Chip size="small" color="primary" label="New" sx={{ height: 20 }} /> : undefined,
    },
    {
      key: "feedback",
      label: "Send feedback",
      icon: <FeedbackOutlinedIcon />,
      path: pathname.startsWith("/internal/feedback") ? pathname : `/internal/feedback?from=${here}`,
      isSelected: (p) => p.startsWith("/internal/feedback"),
    },
  ];

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
      showMessages={true}
      showGems={true}
    >
      {isAdmin && (
        <Link to="/admin" style={{ color: "inherit", display: "flex", marginLeft: 4 }}>
          <IconButton
            sx={{
              // On the light theme the bar is solid primary blue, where amber/dark tints vanish.
              color: (t) => (t.palette.mode === "dark" ? t.palette.warning.main : t.palette.common.white),
              backgroundColor: (t) =>
                alpha(t.palette.mode === "dark" ? t.palette.warning.main : t.palette.common.white, 0.15),
              "&:hover": {
                backgroundColor: (t) =>
                  alpha(t.palette.mode === "dark" ? t.palette.warning.main : t.palette.common.white, 0.28),
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
