import { createRef, type ReactNode } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";

const providerRef = createRef<SnackbarProvider>();

/**
 * The app's toasts: always at the bottom, clear of the top bar that holds the navigation. Up to 5 show at once, each
 * for 4 seconds, and tapping one dismisses it.
 */
export default function AppSnackbarProvider({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery(useTheme().breakpoints.down("sm"));
  return (
    <SnackbarProvider
      ref={providerRef}
      maxSnack={5}
      autoHideDuration={4000}
      anchorOrigin={{ vertical: "bottom", horizontal: isMobile ? "center" : "right" }}
      SnackbarProps={{ onClick: () => providerRef.current?.closeSnackbar() }}
    >
      {children}
    </SnackbarProvider>
  );
}
