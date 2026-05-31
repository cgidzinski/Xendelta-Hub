import { useOutletContext } from "react-router-dom";
import { Box, Typography, Button, Avatar } from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import type { GroupDetailContext } from "./GroupDetail";

export default function GroupSettlements() {
    const { balancesData, user, formatCurrency, onSettle } = useOutletContext<GroupDetailContext>();

    if (!balancesData || balancesData.settlements.length === 0) {
        return (
            <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                    No settlements needed
                </Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2, minHeight: 48, display: "flex", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                    Settlements
                </Typography>
            </Box>
            {balancesData.settlements.map((settlement, idx) => (
                <Box
                    key={idx}
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto 1fr auto 1fr auto 1fr auto",
                        gridTemplateRows: "auto auto",
                        rowGap: { xs: 0.75, sm: 1 },
                        px: { xs: 2, sm: 3 },
                        py: { xs: 1.5, sm: 2 },
                        mb: 1.5,
                        bgcolor: "action.hover",
                        borderRadius: 2,
                        alignItems: "center",
                    }}
                >
                    {/* Col 1: from avatar + name, spans rows 1–2 */}
                    <Box sx={{ gridColumn: 1, gridRow: "1 / 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: { xs: 0.5, sm: 0.75 } }}>
                        <Avatar src={settlement.fromUser.avatar || undefined} sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 }, bgcolor: "error.main" }}>
                            {settlement.fromUser.username[0]?.toUpperCase()}
                        </Avatar>
                        <Typography variant="caption" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontSize: { sm: "0.8rem" } }}>
                            {settlement.fromUser.username}
                        </Typography>
                    </Box>
                    {/* Col 3: arrow, spans rows 1–2 */}
                    <EastIcon sx={{ gridColumn: 3, gridRow: "1 / 3", alignSelf: "center", justifySelf: "center", fontSize: { xs: 14, sm: 18 }, color: "text.disabled" }} />
                    {/* Col 5 row 1: amount */}
                    <Typography
                        variant="body2"
                        sx={{
                            gridColumn: 5,
                            gridRow: 1,
                            alignSelf: "center",
                            justifySelf: "center",
                            fontWeight: 700,
                            fontSize: { sm: "1rem" },
                            whiteSpace: "nowrap",
                            color: settlement.from === user.id
                                ? "error.main"
                                : settlement.to === user.id
                                    ? "success.main"
                                    : "text.primary",
                        }}
                    >
                        {formatCurrency(settlement.amount, settlement.currency)}
                    </Typography>
                    {/* Col 5 row 2: settle button */}
                    <Button
                        variant="outlined"
                        color="success"
                        size="small"
                        sx={{ gridColumn: 5, gridRow: 2, justifySelf: "center", alignSelf: "center", fontWeight: 600, borderRadius: 2, boxShadow: "none", px: { xs: 1, sm: 2 }, fontSize: { xs: "0.75rem", sm: "0.875rem" }, whiteSpace: "nowrap", "&:hover": { boxShadow: "none" } }}
                        onClick={() => onSettle(settlement)}
                    >
                        Settle
                    </Button>
                    {/* Col 7: arrow, spans rows 1–2 */}
                    <EastIcon sx={{ gridColumn: 7, gridRow: "1 / 3", alignSelf: "center", justifySelf: "center", fontSize: { xs: 14, sm: 18 }, color: "text.disabled" }} />
                    {/* Col 9: to avatar + name, spans rows 1–2 */}
                    <Box sx={{ gridColumn: 9, gridRow: "1 / 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: { xs: 0.5, sm: 0.75 } }}>
                        <Avatar src={settlement.toUser.avatar || undefined} sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 }, bgcolor: "success.main" }}>
                            {settlement.toUser.username[0]?.toUpperCase()}
                        </Avatar>
                        <Typography variant="caption" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontSize: { sm: "0.8rem" } }}>
                            {settlement.toUser.username}
                        </Typography>
                    </Box>
                </Box>
            ))}
        </Box>
    );
}
