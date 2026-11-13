import { createRef, type ReactNode } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";

const providerRef = createRef<SnackbarProvider>();

/**
 * The app's toasts: always at the bottom, clear of the top bar that holds the navigation. Tapping one dismisses it.
 * On a phone fewer show at a time and they go sooner.
 */
export default function AppSnackbarProvider({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery(useTheme().breakpoints.down("sm"));
  return (
    <SnackbarProvider
      ref={providerRef}
      maxSnack={isMobile ? 2 : 4}
      autoHideDuration={isMobile ? 4000 : 6000}
      anchorOrigin={{ vertical: "bottom", horizontal: isMobile ? "center" : "right" }}
      SnackbarProps={{ onClick: () => providerRef.current?.closeSnackbar() }}
    >
      {children}
    </SnackbarProvider>
  );
}
