import { Paper, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../../../config/api";
import { ApiResponse } from "../../../../types/api";
import { formatCheddar } from "../utils/currency";

const fetchHouseBalance = async (): Promise<string> =>
    (await apiClient.get<ApiResponse<{ balance: string }>>("/api/casino/house-balance")).data.data!.balance;

export default function HouseBalanceBanner() {
    const { data: balance } = useQuery({
        queryKey: ["casinoHouseBalance"],
        queryFn: fetchHouseBalance,
        staleTime: 15 * 1000,
    });

    return (
        <Paper
            variant="outlined"
            sx={{ p: 2.5, mb: 3, display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
            <Typography variant="body1" color="text.secondary">
                XenCasino's current funds
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: "warning.main" }}>
                🧀 {balance !== undefined ? formatCheddar(balance) : "—"}
            </Typography>
        </Paper>
    );
}
