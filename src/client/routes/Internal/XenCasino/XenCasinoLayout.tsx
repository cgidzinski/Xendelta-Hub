import { useEffect } from "react";
import { Box, Alert, Button } from "@mui/material";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthProviders } from "../../../hooks/auth/useAuthProviders";
import { useCasinoBalance } from "../../../hooks/casino/useCasinoBalance";
import { useCasinoStatus } from "../../../hooks/casino/useCasinoStatus";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import XenCasinoNavbar from "./components/XenCasinoNavbar";
import CasinoClosedOverlay from "./components/CasinoClosedOverlay";
import { CASINO_GAMES_REGISTRY } from "./gamesRegistry";
import { XenCasinoTitlebarProvider } from "./context/XenCasinoTitlebarContext";

function CasinoGate({
    severity,
    message,
    actionLabel,
    onAction,
    actionHref,
}: {
    severity: "warning" | "error";
    message: string;
    actionLabel: string;
    onAction?: () => void;
    actionHref?: string;
}) {
    const actionLinkProps = actionHref ? { href: actionHref, target: "_blank", rel: "noopener noreferrer" } : {};

    return (
        <Box sx={{ px: { xs: 2, sm: 3, md: 5 }, py: 4 }}>
            <Alert
                severity={severity}
                action={
                    <Button color="inherit" size="small" onClick={onAction} {...actionLinkProps}>
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
    const { authProviders, loading: providersLoading, discordLinkHref } = useAuthProviders();
    const { linked, balance, isLoading: balanceLoading, isError, error, refetch } = useCasinoBalance();
    const { open: casinoOpen, reason: casinoClosedReason, bankBalance, disabledGames, isLoading: statusLoading } = useCasinoStatus();
    const location = useLocation();
    const navigate = useNavigate();

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
            actionHref={discordLinkHref}
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

    const currentGame = CASINO_GAMES_REGISTRY.find((g) => location.pathname.startsWith(g.path));
    const gameDisabled = !!currentGame && disabledGames.includes(currentGame.key);

    // The "closed" state only takes over the routed content area, not the navbar or the rest
    // of the app - players can still switch tabs (Ledger/Games) or navigate away entirely,
    // they just can't play while it's up.
    return (
        <XenCasinoTitlebarProvider>
            <Box>
                <XenCasinoNavbar />
                <Box sx={{ position: "relative", px: { xs: 2, sm: 3, md: 5 }, py: { xs: 3, sm: 4 }, minHeight: "calc(100vh - 56px)" }}>
                    {statusLoading ? (
                        <LoadingSpinner />
                    ) : (
                        <>
                            {gameDisabled ? (
                                <CasinoGate
                                    severity="warning"
                                    message={`${currentGame!.label} is temporarily disabled — check back soon.`}
                                    actionLabel="Back to Games"
                                    onAction={() => navigate("/internal/xencasino")}
                                />
                            ) : (
                                <Outlet />
                            )}
                            {/* Rendered on top of the (still-mounted) games/ledger content below, rather
                                than replacing it - the point is a takeover banner you can see through to
                                the games behind, not a blank page. */}
                            {!casinoOpen && (
                                <CasinoClosedOverlay reason={casinoClosedReason} bankBalance={bankBalance} />
                            )}
                        </>
                    )}
                </Box>
            </Box>
        </XenCasinoTitlebarProvider>
    );
}
