import { IconButton, Divider, Box } from "@mui/material";
import { LightMode as LightModeIcon, DarkMode as DarkModeIcon } from "@mui/icons-material";
import { useTheme } from "../contexts/ThemeContext";

interface ThemeToggleProps {
  showDivider?: boolean;
  size?: number;
  sx?: object;
}

export default function ThemeToggle({ showDivider = false, size = 50, sx = {} }: ThemeToggleProps) {
  const { mode, toggleTheme } = useTheme();

  return (
    <>
      {showDivider && (
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 24, alignSelf: "center" }} />
      )}
      <IconButton
        onClick={toggleTheme}
        aria-label="toggle theme"
        color="inherit"
        sx={{ width: size, height: size, ...sx }}
      >
        {mode === "dark" ? (
          <LightModeIcon sx={{ color: "#ffc107" }} />
        ) : (
          <DarkModeIcon sx={{ color: "#2196f3" }} />
        )}
      </IconButton>
    </>
  );
}

