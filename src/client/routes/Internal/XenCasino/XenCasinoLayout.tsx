import { Box, Container, Typography, Tabs, Tab, Alert, Button } from "@mui/material";
import CasinoIcon from "@mui/icons-material/Casino";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthProviders } from "../../../hooks/auth/useAuthProviders";
import { useCasinoBalance } from "../../../hooks/casino/useCasinoBalance";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";

export default function XenCasinoLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { authProviders, loading: providersLoading, linkDiscordAccount } = useAuthProviders();
    const { linked, balance, isLoading: balanceLoading, isError, error } = useCasinoBalance();

    if (providersLoading) {
        return <LoadingSpinner />;
    }

    const hasDiscord = (authProviders?.providers ?? []).some((p) => p.provider === "discord");
    const activeTab = location.pathname.startsWith("/internal/xencasino/ledger") ? 1 : 0;

    return (
        <Box>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ mb: 4, textAlign: "center" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 1 }}>
                        <CasinoIcon sx={{ fontSize: 40, color: "warning.main" }} />
                        <Typography variant="h3" component="h1" sx={{ fontWeight: 700 }}>
                            {hasDiscord && linked ? (balance ?? "—") : "—"}
                        </Typography>
                    </Box>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        Your Cheddar
                    </Typography>
                    <Box sx={{ width: 60, height: 3, backgroundColor: "warning.main", borderRadius: 1, mx: "auto" }} />
                </Box>

                {!hasDiscord && (
                    <Alert
                        severity="warning"
                        sx={{ mb: 3 }}
                        action={
                            <Button color="inherit" size="small" onClick={() => linkDiscordAccount()}>
                                Link Discord
                            </Button>
                        }
                    >
                        Link your Discord account to play XenCasino — your cheddar balance comes straight from your Weeabets account.
                    </Alert>
                )}

                {hasDiscord && (
                    <>
                        <Box sx={{ bgcolor: "action.hover", borderRadius: "8px 8px 0 0", mb: 3 }}>
                            <Tabs
                                value={activeTab}
                                onChange={(_, v) => navigate(v === 0 ? "/internal/xencasino" : "/internal/xencasino/ledger")}
                                variant="fullWidth"
                            >
                                <Tab label="Games" />
                                <Tab label="Ledger" />
                            </Tabs>
                        </Box>

                        {isError ? (
                            <ErrorDisplay error={error} />
                        ) : balanceLoading ? (
                            <LoadingSpinner />
                        ) : (
                            <Outlet />
                        )}
                    </>
                )}
            </Container>
        </Box>
    );
}
