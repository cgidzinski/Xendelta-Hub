import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createAppTheme } from "./index";
import type { ThemeMode } from "./index";
import { useUserProfile } from "../hooks/user/useUserProfile";

/**
 * Read before the profile query resolves, so the first paint is already the right theme
 * instead of flashing dark at someone who chose light. Kept in sync on every save.
 */
const STORAGE_KEY = "xendelta:theme";

function readCachedPreference(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Private mode, or site data blocked. Fall back to the OS setting.
    return "";
  }
}

export default function AppThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  // The profile is the source of truth once it lands; until then the cached copy stands in.
  const preference = profile?.theme ?? readCachedPreference();

  useEffect(() => {
    if (profile?.theme === undefined) return;
    try {
      localStorage.setItem(STORAGE_KEY, profile.theme);
    } catch {
      // Nothing to do — the preference still works for this session.
    }
  }, [profile?.theme]);

  const mode: ThemeMode = preference === "light" || preference === "dark"
    ? preference
    : prefersDark ? "dark" : "light";

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  // The PWA's status bar colour is baked into index.html and would otherwise stay the
  // dark blue regardless of which theme is actually on screen.
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme.palette.background.default);
  }, [theme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
