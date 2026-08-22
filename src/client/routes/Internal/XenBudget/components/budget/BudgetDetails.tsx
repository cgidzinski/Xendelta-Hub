import { Box, Button, LinearProgress, Stack, Typography, alpha } from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import EditIcon from "@mui/icons-material/Edit";
import { format } from "date-fns";
import type {
    BudgetStatus, SubBudgetStatus, XenBudgetMember,
} from "../../../../../hooks/xenbudget/types";
import { formatCurrency } from "../../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { budgetPace } from "./budgetPace";
import { aheadIsGood } from "./budgetKind";
import { memberColor } from "./budgetColors";
import BudgetTarget from "./BudgetTarget";

const PERIOD_NAMES: Record<string, string> = {
    weekly: "weekly", monthly: "monthly", quarterly: "quarterly",
    yearly: "yearly", custom: "one-off",
};

/**
 * `period_to` is exclusive - the instant the next period begins - so showing it raw dates
 * a monthly budget as "Aug 1 - Sep 1". Backing off an instant names the last day the
 * budget actually covers.
 */
function windowLabel(from: string, to: string): string {
    const start = new Date(from);
    const last = new Date(new Date(to).getTime() - 1);
    const sameYear = start.getFullYear() === last.getFullYear();
    return `${format(start, "MMM d")} – ${format(last, sameYear ? "MMM d" : "MMM d, yyyy")}`;
}

interface BudgetDetailsProps {
    budget: BudgetStatus;
    /** Which limit was opened: the shared one, or one person's. */
    focus: SubBudgetStatus | null;
    currency: string;
    members: XenBudgetMember[];
    asOf: string;
    onViewItems?: () => void;
    onEdit?: () => void;
}

/**
 * What a bar can't say: which days it covers, whether the spend is ahead of an even pace,
 * and - for a shared limit - who it went to. Opened in place, because losing your spot on
 * the overview to read a number is a bad trade.
 */
export default function BudgetDetails({
    budget, focus, currency, members, asOf, onViewItems, onEdit,
}: BudgetDetailsProps) {
    const money = (v: number) => formatCurrency(v, currency);
    const amount = focus ? focus.amount : budget.amount;
    const spent = focus ? focus.spent : budget.spent;
    const itemCount = focus ? focus.item_count : budget.item_count;
    const pace = budgetPace(budget.period_from, budget.period_to, asOf, spent, amount ?? 0);

    // Only the people with no limit of their own need naming here; the ones who have a
    // limit already have their own bar on the card above.
    const cappedIds = new Set(budget.sub_budgets.map((s) => s.person_id));
    const breakdown = focus ? [] : budget.by_person.filter((p) => p.amount > 0);

    return (
        <Stack spacing={1.25} sx={{ pt: 1.25 }}>
            <Typography variant="caption" color="text.secondary">
                {windowLabel(budget.period_from, budget.period_to)}
                {" · "}{PERIOD_NAMES[budget.period] || budget.period}
                {" · "}{itemCount} {itemCount === 1 ? "item" : "items"}
            </Typography>

            {amount !== undefined && amount > 0 && (
                <Typography variant="caption" color="text.secondary">
                    {pace.finished
                        ? `Period closed — ${money(spent)} of ${money(amount)} ${
                            budget.kind === "goal" ? "saved" : "used"}`
                        : `Day ${pace.dayOf} of ${pace.totalDays} — ${
                            Math.abs(pace.ahead) < 0.01
                                ? "exactly on pace"
                                : pace.ahead > 0
                                    // Outrunning an even pace empties a cap early and
                                    // fills a goal early - the same number, opposite news.
                                    ? `${money(pace.ahead)} ${aheadIsGood(budget.kind) ? "ahead of pace" : "over pace"}`
                                    : `${money(-pace.ahead)} ${aheadIsGood(budget.kind) ? "behind pace" : "under pace"}`
                        }, projected ${money(pace.projected)}`}
                </Typography>
            )}

            {focus && budget.amount !== undefined && (
                <Typography variant="caption" color="text.secondary">
                    {budget.kind === "goal"
                        ? `Part of the ${money(budget.amount)} shared goal, which is ${
                            budget.percent ?? 0}% funded.`
                        : `Inside the ${money(budget.amount)} shared limit, which is ${
                            budget.percent ?? 0}% used.`}
                </Typography>
            )}

            {breakdown.length > 0 && (
                <Box>
                    <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                        {budget.kind === "goal" ? "Who put it in" : "Who spent it"}
                    </Typography>
                    <Stack spacing={1}>
                        {breakdown.map((person) => {
                            const share = spent > 0 ? (person.amount / spent) * 100 : 0;
                            return (
                                <Box key={person.user_id}>
                                    <Stack
                                        direction="row" alignItems="center" spacing={1}
                                        sx={{ mb: 0.375, minWidth: 0 }}
                                    >
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <BudgetTarget
                                                personId={person.user_id}
                                                personName={person.username}
                                                members={members}
                                                size={18}
                                            />
                                        </Box>
                                        <Typography variant="caption" noWrap sx={{ flexShrink: 0 }}>
                                            {money(person.amount)}
                                        </Typography>
                                        <Typography
                                            variant="caption" color="text.secondary" noWrap
                                            sx={{ flexShrink: 0, minWidth: 32, textAlign: "right" }}
                                        >
                                            {Math.round(share)}%
                                        </Typography>
                                    </Stack>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(100, share)}
                                        sx={{
                                            height: 4, borderRadius: 999,
                                            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
                                            "& .MuiLinearProgress-bar": {
                                                borderRadius: 999,
                                                bgcolor: memberColor(person.user_id, members),
                                            },
                                        }}
                                    />
                                    {cappedIds.has(person.user_id) && (
                                        <Typography variant="caption" color="text.disabled">
                                            has their own {budget.kind === "goal" ? "target" : "limit"} above
                                        </Typography>
                                    )}
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>
            )}

            {!focus && budget.categories.length > 1 && (
                <Typography variant="caption" color="text.secondary">
                    Covers {budget.categories.join(", ")}.
                </Typography>
            )}

            {(onViewItems || onEdit) && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                    {onViewItems && (
                        <Button size="small" startIcon={<ReceiptLongIcon />} onClick={onViewItems}>
                            View items
                        </Button>
                    )}
                    {onEdit && (
                        <Button size="small" startIcon={<EditIcon />} onClick={onEdit}>
                            Edit budget
                        </Button>
                    )}
                </Stack>
            )}
        </Stack>
    );
}
