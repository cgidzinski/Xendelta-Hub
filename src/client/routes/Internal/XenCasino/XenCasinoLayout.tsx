import { useEffect } from "react";
import { Box, Alert, Button } from "@mui/material";
import { Outlet, useLocation } from "react-router-dom";
import { useAuthProviders } from "../../../hooks/auth/useAuthProviders";
import { useCasinoBalance } from "../../../hooks/casino/useCasinoBalance";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import XenCasinoNavbar from "./components/XenCasinoNavbar";
import { XenCasinoTitlebarProvider } from "./context/XenCasinoTitlebarContext";

function CasinoGate({
    severity,
    message,
    actionLabel,
    onAction,
}: {
    severity: "warning" | "error";
    message: string;
    actionLabel: string;
    onAction: () => void;
}) {
    return (
        <Box sx={{ px: { xs: 2, sm: 3, md: 5 }, py: 4 }}>
            <Alert
                severity={severity}
                action={
                    <Button color="inherit" size="small" onClick={onAction}>
                        {actionLabel}
                    </Button>
                }
            >
                {message}
            </Alert>
        </Box>
    );
}

export default function XenCasinoLayout() {
    useTitle("XenCasino");
    const { authProviders, loading: providersLoading, linkDiscordAccount } = useAuthProviders();
    const { linked, balance, isLoading: balanceLoading, isError, error, refetch } = useCasinoBalance();
    const location = useLocation();

    // Client-side route changes don't reset window scroll on their own - without this, landing
    // on a game page keeps whatever scroll position the (often tall) games list was at.
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    if (providersLoading) {
        return <LoadingSpinner />;
    }

    const hasDiscord = (authProviders?.providers ?? []).some((p) => p.provider === "discord");

    const discordGate = (
        <CasinoGate
            severity="warning"
            message="Link your Discord account to play XenCasino — your cheddar balance comes straight from your Weeabets account."
            actionLabel="Link Discord"
            onAction={() => linkDiscordAccount()}
        />
    );

    if (!hasDiscord) {
        return discordGate;
    }

    if (balanceLoading) {
        return <LoadingSpinner />;
    }

    if (isError) {
        return (
            <CasinoGate
                severity="error"
                message={`We couldn't reach your Weeabets account: ${error?.message ?? "an unexpected error occurred"}.`}
                actionLabel="Try Again"
                onAction={() => refetch()}
            />
        );
    }

    if (!linked) {
        return discordGate;
    }

    if (balance === null) {
        return (
            <CasinoGate
                severity="warning"
                message="Your Discord is connected, but we couldn't find a XenCasino account for it yet. Make sure you've used the Weeabets bot on Discord, then refresh."
                actionLabel="Refresh"
                onAction={() => refetch()}
            />
        );
    }

    return (
        <XenCasinoTitlebarProvider>
            <Box>
                <XenCasinoNavbar />
                <Box sx={{ px: { xs: 2, sm: 3, md: 5 }, py: { xs: 3, sm: 4 } }}>
                    <Outlet />
                </Box>
            </Box>
        </XenCasinoTitlebarProvider>
    );
}
