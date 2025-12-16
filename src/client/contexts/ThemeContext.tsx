import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createTheme, Theme } from "@mui/material/styles";

type ThemeMode = "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  theme: Theme;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "xendelta-theme-mode";

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  
  // Default to dark mode
  return "dark";
}

function createAppTheme(mode: ThemeMode): Theme {
  if (mode === "light") {
    return createTheme({
      palette: {
        mode: "light",
        primary: {
          main: "#2196f3",
          light: "#42a5f5",
          dark: "#1976d2",
        },
        secondary: {
          main: "#9c27b0", // Softer purple instead of bright magenta
          light: "#ba68c8",
          dark: "#7b1fa2",
        },
        background: {
          default: "#f8f9fc", // Soft blue-tinted background
          paper: "#ffffff",
        },
        text: {
          primary: "rgba(0, 0, 0, 0.87)",
          secondary: "rgba(0, 0, 0, 0.6)",
        },
        divider: "rgba(33, 150, 243, 0.12)", // Subtle blue-tinted divider
        action: {
          hover: "rgba(33, 150, 243, 0.08)", // Soft blue hover
          selected: "rgba(33, 150, 243, 0.12)",
        },
      },
      components: {
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundColor: "#ffffff",
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              backgroundColor: "#ffffff",
              boxShadow: "0 2px 8px rgba(33, 150, 243, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)",
              border: "1px solid rgba(33, 150, 243, 0.1)", // Subtle blue border
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              background: "linear-gradient(135deg, #ffffff 0%, #f8f9fc 100%)",
              color: "rgba(0, 0, 0, 0.87)",
              boxShadow: "0 2px 8px rgba(33, 150, 243, 0.1)",
              borderBottom: "1px solid rgba(33, 150, 243, 0.15)",
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            contained: {
              boxShadow: "0 2px 8px rgba(33, 150, 243, 0.3)",
              "&:hover": {
                boxShadow: "0 4px 12px rgba(33, 150, 243, 0.4)",
              },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              backgroundColor: "rgba(33, 150, 243, 0.1)",
              color: "#1976d2",
            },
          },
        },
      },
    });
  }

  // Dark mode theme
  return createTheme({
    palette: {
      mode: "dark",
      primary: {
        main: "#2196f3",
        light: "#42a5f5",
        dark: "#1976d2",
      },
      secondary: {
        main: "#ff00ff",
        light: "#ff33ff",
        dark: "#cc00cc",
      },
    },
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);
  const [theme, setTheme] = useState<Theme>(() => createAppTheme(mode));

  useEffect(() => {
    setTheme(createAppTheme(mode));
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode]);

  const toggleTheme = () => {
    setModeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
  };

  const value: ThemeContextType = {
    mode,
    theme,
    toggleTheme,
    setMode,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

