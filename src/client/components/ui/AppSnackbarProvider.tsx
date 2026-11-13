import { createRef, type ReactNode } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";

const providerRef = createRef<SnackbarProvider>();

/**
 * The app's toasts. On a phone the top bar holds the navigation, so toasts sit at the bottom instead, fewer
 * at a time and gone sooner, and tapping one dismisses it. On a larger screen they stay top right.
 */
export default function AppSnackbarProvider({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery(useTheme().breakpoints.down("sm"));
  return (
    <SnackbarProvider
      ref={providerRef}
      maxSnack={isMobile ? 2 : 4}
      autoHideDuration={isMobile ? 4000 : 6000}
      anchorOrigin={isMobile ? { vertical: "bottom", horizontal: "center" } : { vertical: "top", horizontal: "right" }}
      SnackbarProps={{ onClick: () => providerRef.current?.closeSnackbar() }}
    >
      {children}
    </SnackbarProvider>
  );
}
