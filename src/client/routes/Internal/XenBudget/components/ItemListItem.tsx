import { Avatar, AvatarGroup, Box, Stack, Tooltip, Typography, alpha } from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import type { XenBudgetItem, XenBudgetMember, XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { formatCurrency } from "../../../../utils/currencyUtils";
import { CategoryChip, TagChip } from "./LabelChip";
import { xbCardSx, xbBadgeSx, xbExcludedRowSx } from "./rowStyles";

interface ItemListItemProps {
    item: XenBudgetItem;
    members: XenBudgetMember[];
    categoryRegistry: XenBudgetLabel[];
    tagRegistry: XenBudgetLabel[];
    onClick: (item: XenBudgetItem) => void;
}

export default function ItemListItem({ item, members, categoryRegistry, tagRegistry, onClick }: ItemListItemProps) {
    const isIncome = item.type === "income";
    const people = item.shares
        .map((s) => members.find((m) => m.user_id === s.user_id))
        .filter((m): m is XenBudgetMember => !!m);

    return (
        <Box
            onClick={() => onClick(item)}
            sx={{
                ...xbCardSx,
                ...(item.excluded ? xbExcludedRowSx : {}),
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
                        isIncome ? theme.palette.success.main : theme.palette.primary.main, 0.15,
                    ),
                    color: isIncome ? "success.main" : "primary.main",
                }}
            >
                {isIncome ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
            </Box>

            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                        {item.description}
                    </Typography>
                    {item.excluded && (
                        <Tooltip title={item.excluded_reason || "Excluded from totals"}>
                            <BlockIcon sx={{ fontSize: 15 }} color="disabled" />
                        </Tooltip>
                    )}
                </Stack>
                {(item.categories.length > 0 || item.tags.length > 0) && (
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
                        {item.tags.map((t) => (
                            <TagChip key={t} name={t} registry={tagRegistry} sx={{ height: 18 }} />
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
                    color: isIncome ? "success.main" : "text.primary",
                    // An excluded amount must not read as money that counted.
                    textDecoration: item.excluded ? "line-through" : "none",
                }}
            >
                {isIncome ? "+" : "−"}{formatCurrency(item.amount, item.currency)}
            </Typography>
        </Box>
    );
}
