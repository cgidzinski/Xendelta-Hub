import HomeIcon from "@mui/icons-material/Home";
import ArticleIcon from "@mui/icons-material/Article";
import SettingsIcon from "@mui/icons-material/Settings";
import SecurityIcon from "@mui/icons-material/Security";
import BrushIcon from "@mui/icons-material/Brush";
import { useNavBar } from "../../contexts/NavBarContext";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import BaseNavBar, { NavItem } from "./BaseNavBar";

export default function Root() {
  const { isNavBarOpen, toggleNavBar, title } = useNavBar();
  const { profile } = useUserProfile();

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
      key: "blog-divider",
      label: "",
      icon: null,
      path: "",
      isSelected: () => false,
      type: "divider",
    },
    {
      key: "apps-header",
      label: "Apps",
      icon: null,
      path: "",
      isSelected: () => false,
      type: "header",
    },
    {
      key: "recipaint",
      label: "Recipaint",
      icon: <BrushIcon />,
      path: "/internal/recipaint",
      isSelected: (pathname) => pathname.startsWith("/internal/recipaint"),
      indent: true,
    },
  ];

  const footerNavItems: NavItem[] = [
    ...(profile?.roles?.some((role: string) => role.toLowerCase() === "admin")
      ? [
          {
            key: "admin",
            label: "Admin",
            icon: <SecurityIcon />,
            path: "/admin",
            isSelected: (pathname: string) => pathname.endsWith("/admin"),
          },
        ]
      : []),
    {
      key: "settings",
      label: "Settings",
      icon: <SettingsIcon />,
      path: "/internal/settings",
      isSelected: (pathname) => pathname.endsWith("/internal/settings"),
    },
  ];

  return (
    <BaseNavBar
      title={title}
      isNavBarOpen={isNavBarOpen}
      onToggleNavBar={toggleNavBar}
      navItems={navItems}
      footerNavItems={footerNavItems}
      showNotifications={true}
      showMessages={true}
    />
  );
}
