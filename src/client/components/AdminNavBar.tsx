import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import SecurityIcon from "@mui/icons-material/Security";
import PeopleIcon from "@mui/icons-material/People";
import ArticleIcon from "@mui/icons-material/Article";
import HomeIcon from "@mui/icons-material/Home";
import { useNavBar } from "../contexts/NavBarContext";
import BaseNavBar, { NavItem } from "./BaseNavBar";
import { useNavBarSocket } from "../hooks/useNavBarSocket";

export default function AdminNavBar() {
  const location = useLocation();
  const { title } = useNavBar();
  const [isNavBarOpen, setIsNavBarOpen] = useState(true);

  useNavBarSocket({
    showSystemMessageNotifications: true,
  });

  const toggleNavBar = () => {
    setIsNavBarOpen(!isNavBarOpen);
  };

  const navItems: NavItem[] = [
    {
      key: "admin",
      label: "General",
      icon: <SecurityIcon />,
      path: "/admin",
      isSelected: (pathname) => pathname === "/admin",
    },
    {
      key: "users",
      label: "Users",
      icon: <PeopleIcon />,
      path: "/admin/users",
      isSelected: (pathname) => pathname === "/admin/users",
    },
    {
      key: "blog",
      label: "Blog Management",
      icon: <ArticleIcon />,
      path: "/admin/blog",
      isSelected: (pathname) => pathname.startsWith("/admin/blog"),
    },
  ];

  const footerNavItems: NavItem[] = [
    {
      key: "home",
      label: "Back to Home",
      icon: <HomeIcon />,
      path: "/internal",
      isSelected: () => false,
    },
  ];

  return (
    <BaseNavBar
      title={title || "General"}
      isNavBarOpen={isNavBarOpen}
      onToggleNavBar={toggleNavBar}
      navItems={navItems}
      footerNavItems={footerNavItems}
    />
  );
}
