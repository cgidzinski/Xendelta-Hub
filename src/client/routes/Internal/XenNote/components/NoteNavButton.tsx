import { IconButton } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { useOutletContext } from "react-router-dom";

export default function NoteNavButton() {
  const openNavigation = useOutletContext<() => void>();

  return (
    <IconButton aria-label="Open XenNote navigation" onClick={openNavigation} sx={{ display: { md: "none" } }}>
      <MenuIcon />
    </IconButton>
  );
}
