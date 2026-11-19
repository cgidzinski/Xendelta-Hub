import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Typography } from "@mui/material";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import LandingHeader from "../../../components/LandingHeader";
import { useTitle } from "../../../hooks/useTitle";
import { userProfileKeys } from "../../../hooks/user/useUserProfile";

type State = { kind: "working" } | { kind: "done"; email: string } | { kind: "failed"; message: string };

/** The page the emailed link opens: it confirms the new address and says what happened. Works signed in or out. */
export default function ConfirmEmail() {
  useTitle("Confirm your email");
  const [params] = useSearchParams();
  const token = params.get("token");
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>(
    token ? { kind: "working" } : { kind: "failed", message: "This link is incomplete." },
  );
  // Strict mode runs effects twice in development; the link can only be used once.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    fetch("/api/auth/confirm-email-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status) {
          setState({ kind: "done", email: data.data?.email ?? "" });
          void queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
        } else {
          setState({ kind: "failed", message: data.message || "This link is invalid or has expired." });
        }
      })
      .catch(() => setState({ kind: "failed", message: "Couldn't reach the server. Try opening the link again." }));
  }, [token, queryClient]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <LandingHeader />
      <Container maxWidth="sm" sx={{ flex: 1, display: "flex", alignItems: "center", py: 4 }}>
        <Card variant="outlined" sx={{ width: "100%" }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="h5" component="h1" gutterBottom>
              Confirm your email
            </Typography>
            {state.kind === "working" && <CircularProgress sx={{ my: 2 }} />}
            {state.kind === "done" && (
              <>
                <Alert severity="success" sx={{ my: 2, textAlign: "left" }}>
                  Your email is now {state.email}. Use it the next time you sign in.
                </Alert>
                <Button variant="contained" component={RouterLink} to="/internal/settings">
                  Continue
                </Button>
              </>
            )}
            {state.kind === "failed" && (
              <>
                <Alert severity="error" sx={{ my: 2, textAlign: "left" }}>
                  {state.message}
                </Alert>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Links work once and expire after an hour. You can ask for a new one from Settings.
                </Typography>
                <Button variant="outlined" component={RouterLink} to="/internal/settings">
                  Go to Settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
