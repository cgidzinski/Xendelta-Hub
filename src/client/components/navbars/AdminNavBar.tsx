import SecurityIcon from "@mui/icons-material/Security";
import PeopleIcon from "@mui/icons-material/People";
import ArticleIcon from "@mui/icons-material/Article";
import CasinoIcon from "@mui/icons-material/Casino";
import HomeIcon from "@mui/icons-material/Home";
import IconButton from "@mui/material/IconButton";
import { Link } from "react-router-dom";
import { useNavBar } from "../../contexts/NavBarContext";
import BaseNavBar, { NavItem } from "./BaseNavBar";

export default function AdminNavBar() {
  const { isNavBarOpen, toggleNavBar, title } = useNavBar();

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
    {
      key: "casino",
      label: "Casino",
      icon: <CasinoIcon />,
      path: "/admin/casino",
      isSelected: (pathname) => pathname === "/admin/casino",
    },
  ];

  const footerNavItems: NavItem[] = [];

  return (
    <BaseNavBar
      title={title || "General"}
      isNavBarOpen={isNavBarOpen}
      onToggleNavBar={toggleNavBar}
      navItems={navItems}
      footerNavItems={footerNavItems}
      showNotifications={false}
      showMessages={false}
      showPoints={false}
      showProfile={false}
    >
      <Link to="/internal" style={{ color: "inherit", display: "flex" }}>
        <IconButton
          sx={{
            color: "primary.main",
            backgroundColor: "rgba(33, 150, 243, 0.1)",
            "&:hover": {
              backgroundColor: "rgba(33, 150, 243, 0.2)",
            },
          }}
        >
          <HomeIcon />
        </IconButton>
      </Link>
    </BaseNavBar>
  );
}
