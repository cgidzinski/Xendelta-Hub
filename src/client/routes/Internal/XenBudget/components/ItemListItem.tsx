import { Avatar, AvatarGroup, Box, Stack, Typography, alpha } from "@mui/material";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import type { XenBudgetItem, XenBudgetMember, XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { formatCurrency } from "../currency";
import { CategoryChip, FlagChip } from "./LabelChip";
import { xbCardSx, xbBadgeSx, xbOffBudgetRowSx } from "./rowStyles";
import { FLAG_OFF_BUDGET } from "../../../../constants/xenbudget";

interface ItemListItemProps {
    item: XenBudgetItem;
    members: XenBudgetMember[];
    categoryRegistry: XenBudgetLabel[];
    flagRegistry: XenBudgetLabel[];
    onClick: (item: XenBudgetItem) => void;
}

export default function ItemListItem({ item, members, categoryRegistry, flagRegistry, onClick }: ItemListItemProps) {
    const isIncome = item.type === "income";
    const people = item.shares
        .map((s) => members.find((m) => m.user_id === s.user_id))
        .filter((m): m is XenBudgetMember => !!m);

    return (
        <Box
            onClick={() => onClick(item)}
            sx={{
                ...xbCardSx,
                ...(item.flags.includes(FLAG_OFF_BUDGET) ? xbOffBudgetRowSx : {}),
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
            }}
        >
            <Box
                sx={{
                    ...xbBadgeSx,
                    bgcolor: (theme) => alpha(
                        isIncome ? theme.palette.success.main : theme.palette.error.main, 0.15,
                    ),
                    color: isIncome ? "success.main" : "error.main",
                }}
            >
                {isIncome ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
            </Box>

            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    {(item.images?.length ?? 0) > 0 && (
                        <ReceiptLongIcon sx={{ fontSize: 14, color: "text.secondary", flexShrink: 0 }} />
                    )}
                    {item.applied_rule_ids.length > 0 && (
                        <LocalOfferIcon sx={{ fontSize: 14, color: "text.secondary", flexShrink: 0 }} />
                    )}
                    <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                        {item.description}
                    </Typography>
                </Stack>
                {(item.categories.length > 0 || item.flags.length > 0) && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, flexWrap: "wrap", gap: 0.5 }}>
                        {item.categories.map((c) => (
                            <CategoryChip
                                key={c.name} name={c.name} registry={categoryRegistry} sx={{ height: 18 }}
                                // Only worth showing when the purchase was actually divided.
                                weight={item.categories.length > 1 && item.amount > 0
                                    ? `${Math.round((c.amount / item.amount) * 100)}%`
                                    : undefined}
                            />
                        ))}
                        {item.flags.map((t) => (
                            <FlagChip key={t} name={t} registry={flagRegistry} sx={{ height: 18 }} />
                        ))}
                    </Stack>
                )}
            </Box>

            <AvatarGroup max={3} sx={{ "& .MuiAvatar-root": { width: 24, height: 24, fontSize: 11 } }}>
                {people.map((m) => (
                    <Avatar key={m.user_id} src={m.avatar || undefined} alt={m.username}>
                        {m.username[0]?.toUpperCase()}
                    </Avatar>
                ))}
            </AvatarGroup>

            <Typography
                variant="body2"
                sx={{
                    fontWeight: 600,
                    flexShrink: 0,
                    color: isIncome ? "success.main" : "error.main",
                    // An off-budget amount must not read as money that counted.
                    textDecoration: item.flags.includes(FLAG_OFF_BUDGET) ? "line-through" : "none",
                }}
            >
                {isIncome ? "+" : "−"}{formatCurrency(item.amount, item.currency)}
            </Typography>
        </Box>
    );
}
