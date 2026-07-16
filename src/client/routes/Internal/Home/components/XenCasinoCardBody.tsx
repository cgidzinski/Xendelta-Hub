import { Typography, Skeleton } from "@mui/material";
import { useCasinoBalance } from "../../../../hooks/casino/useCasinoBalance";
import { formatCheddar } from "../../../Internal/XenCasino/utils/currency";

export default function XenCasinoCardBody() {
    const { balance, isLoading } = useCasinoBalance();

    if (isLoading) return <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />;

    return (
        <Typography variant="body1" sx={{ fontWeight: 700, color: "warning.main" }}>
            🧀 {formatCheddar(balance)}
        </Typography>
    );
}
