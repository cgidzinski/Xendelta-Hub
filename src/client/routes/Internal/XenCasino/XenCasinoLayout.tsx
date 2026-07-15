import { Box, Alert, Button } from "@mui/material";
import { Outlet } from "react-router-dom";
import { useAuthProviders } from "../../../hooks/auth/useAuthProviders";
import { useCasinoBalance } from "../../../hooks/casino/useCasinoBalance";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import XenCasinoNavbar from "./components/XenCasinoNavbar";
import { XenCasinoTitlebarProvider } from "./context/XenCasinoTitlebarContext";

export default function XenCasinoLayout() {
    useTitle("XenCasino");
    const { authProviders, loading: providersLoading, linkDiscordAccount } = useAuthProviders();
    const { isLoading: balanceLoading, isError, error } = useCasinoBalance();

    if (providersLoading) {
        return <LoadingSpinner />;
    }

    const hasDiscord = (authProviders?.providers ?? []).some((p) => p.provider === "discord");

    if (!hasDiscord) {
        return (
            <Box sx={{ px: { xs: 2, sm: 3, md: 5 }, py: 4 }}>
                <Alert
                    severity="warning"
                    action={
                        <Button color="inherit" size="small" onClick={() => linkDiscordAccount()}>
                            Link Discord
                        </Button>
                    }
                >
                    Link your Discord account to play XenCasino — your cheddar balance comes straight from your Weeabets account.
                </Alert>
            </Box>
        );
    }

    return (
        <XenCasinoTitlebarProvider>
            <Box>
                <XenCasinoNavbar />
                <Box sx={{ px: { xs: 2, sm: 3, md: 5 }, py: { xs: 3, sm: 4 } }}>
                    {isError ? <ErrorDisplay error={error} /> : balanceLoading ? <LoadingSpinner /> : <Outlet />}
                </Box>
            </Box>
        </XenCasinoTitlebarProvider>
    );
}
