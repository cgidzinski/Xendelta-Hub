import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../config/api";
import { useAuth } from "../../../contexts/AuthContext";

interface ShareLinkGateProps<T> {
  /** Authenticated endpoint that says whether this link's content is already the signed-in person's. */
  url: string | undefined;
  /** Where to send them (the real page in the app), or null to show the public page as usual. */
  target: (answer: T) => string | null;
  children: ReactNode;
}

/**
 * Wraps a public link page. Signed out, it shows the page straight away. Signed in, it asks the server whether the
 * content is already theirs (they own it, or are a member of its book) and, if so, replaces the public page with the
 * real one in the app, which knows their role. Anyone else, or any failure, still gets the public page.
 */
export default function ShareLinkGate<T>({ url, target, children }: ShareLinkGateProps<T>) {
  const { isAuthenticated, isLoading } = useAuth();
  const answer = useQuery({
    queryKey: ["share-link-gate", url],
    queryFn: () => api.get<T>(url as string),
    enabled: isAuthenticated && !!url,
    retry: false,
    staleTime: 0,
  });
  if (isLoading || (isAuthenticated && !!url && answer.isLoading)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }
  const to = answer.data ? target(answer.data) : null;
  return to ? <Navigate to={to} replace /> : <>{children}</>;
}
