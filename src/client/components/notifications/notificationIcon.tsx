import AnnouncementIcon from "@mui/icons-material/Announcement";
import LockIcon from "@mui/icons-material/Lock";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";

export function getNotificationIcon(icon: string) {
  switch (icon) {
    case "person":
      return <PersonIcon />;
    case "security":
      return <SecurityIcon />;
    case "announcement":
      return <AnnouncementIcon />;
    case "lock":
      return <LockIcon />;
    case "menu_book":
      return <MenuBookOutlinedIcon />;
    case "sticky_note_2":
      return <StickyNote2OutlinedIcon />;
    default:
      return <NotificationsIcon />;
  }
}
