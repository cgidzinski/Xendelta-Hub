import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import type {
    XenBudgetPiggyBankContribution, XenBudgetMember,
} from "../../../../../hooks/xenbudget/types";
import { formatCurrency } from "../../currency";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";

interface ContributionListProps {
    contributions: XenBudgetPiggyBankContribution[];
    currency: string;
    members: XenBudgetMember[];
    onEdit: (contribution: XenBudgetPiggyBankContribution) => void;
    onDelete: (contribution: XenBudgetPiggyBankContribution) => void;
    isBusy: boolean;
}

/**
 * A bank's ledger, newest first.
 *
 * Deposits and withdrawals share the list rather than being split into two: the running
 * balance is the two read together, and a withdrawal hidden on another tab is exactly the
 * movement someone would go looking for when the total doesn't match what they expected.
 */
export default function ContributionList({
    contributions, currency, members, onEdit, onDelete, isBusy,
}: ContributionListProps) {
    const nameFor = (userId: string) =>
        members.find((m) => m.user_id === userId)?.username ?? "Someone";

    const rows = [...contributions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    if (rows.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                Nothing put in yet.
            </Typography>
        );
    }

    return (
        <Stack spacing={0.75}>
            {rows.map((c) => {
                const out = c.amount < 0;
                return (
                    <Stack
                        key={c._id} direction="row" alignItems="center" spacing={1}
                        sx={{ minWidth: 0 }}
                    >
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                            <Typography variant="body2" noWrap>
                                {c.note || (out ? "Taken out" : "Contribution")}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                                {new Date(c.date).toLocaleDateString(undefined, {
                                    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
                                })}
                                {" · "}{nameFor(c.user_id)}
                            </Typography>
                        </Box>
                        {c.item_id && (
                            <Tooltip title="Also recorded as a transaction">
                                <ReceiptLongIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                            </Tooltip>
                        )}
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, flexShrink: 0, color: out ? "error.main" : INCOME_COLOR }}
                        >
                            {out ? "−" : "+"}{formatCurrency(Math.abs(c.amount), currency)}
                        </Typography>
                        <IconButton size="small" disabled={isBusy} onClick={() => onEdit(c)} aria-label="Edit entry">
                            <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" disabled={isBusy} onClick={() => onDelete(c)} aria-label="Delete entry">
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Stack>
                );
            })}
        </Stack>
    );
}
