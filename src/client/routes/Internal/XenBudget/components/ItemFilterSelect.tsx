import { useMemo, useState } from "react";
import {
    Avatar, Box, Button, Checkbox, Dialog, DialogContent, DialogTitle, Divider, IconButton,
    InputAdornment, MenuItem, Popover, Stack, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterList";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import type { XenBudgetLabel, XenBudgetMember } from "../../../../hooks/xenbudget/types";
import { CategoryChip, FlagChip } from "./LabelChip";
import {
    CATEGORY_PREFIX, FILTER_GROUPS, PERSON_PREFIX, TYPE_EXPENSE, TYPE_INCOME,
    filterGroupOf, optionLabel, summariseFilters, type FilterGroup,
} from "./itemFilterOptions";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";

interface ItemFilterSelectProps {
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
    members: XenBudgetMember[];
    categories: XenBudgetLabel[];
    flags: XenBudgetLabel[];
    sx?: SxProps<Theme>;
}

/**
 * The item list's main filter.
 *
 * A trigger button that opens a menu, rather than a field that renders its selection
 * inline: the button's label is a summary ("All", "3", "Groceries +2"), so it stays the
 * same size however much is selected and Source, Filters and the period pill can share
 * one line on a phone. It replaced a multi-select Autocomplete whose chips grew the
 * control until the row had to wrap.
 *
 * The value is the same flat string[] the Autocomplete produced — see itemFilterOptions —
 * so nothing downstream of it changed.
 */
export default function ItemFilterSelect({
    options, value, onChange, members, categories, flags, sx,
}: ItemFilterSelectProps) {
    const theme = useTheme();
    const compact = useMediaQuery(theme.breakpoints.down("sm"));
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [search, setSearch] = useState("");
    const open = Boolean(anchor);

    const labelOf = (option: string) => optionLabel(option, members);

    const close = () => {
        setAnchor(null);
        setSearch("");
    };

    const toggle = (option: string) => {
        onChange(value.includes(option)
            ? value.filter((v) => v !== option)
            : [...value, option]);
    };

    // Grouped and search-narrowed in one pass, so an empty group can be skipped entirely
    // rather than rendering a heading over nothing.
    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        const matches = q
            ? options.filter((o) => optionLabel(o, members).toLowerCase().includes(q))
            : options;
        return FILTER_GROUPS
            .map((group) => ({
                group,
                options: matches.filter((o) => filterGroupOf(o) === group),
            }))
            .filter((g) => g.options.length > 0);
    }, [options, search, members]);

    const body = (
        <Stack sx={{ minHeight: 0 }}>
            <Box sx={{ p: 1.5, pb: 1, flexShrink: 0 }}>
                <TextField
                    size="small" fullWidth autoFocus={!compact} placeholder="Search filters"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                            ),
                        },
                    }}
                />
                {value.length > 0 && (
                    <Stack
                        direction="row" alignItems="center" justifyContent="space-between"
                        sx={{ mt: 1 }}
                    >
                        <Typography variant="caption" color="text.secondary">
                            {value.length} selected
                        </Typography>
                        <Button size="small" onClick={() => onChange([])}>Clear all</Button>
                    </Stack>
                )}
            </Box>
            <Divider />
            <Box sx={{ overflowY: "auto", flex: 1, minHeight: 0, py: 0.5 }}>
                {groups.length === 0 ? (
                    <Typography
                        variant="body2" color="text.secondary"
                        sx={{ px: 2, py: 2, textAlign: "center" }}
                    >
                        No filters match "{search.trim()}".
                    </Typography>
                ) : groups.map(({ group, options: groupOptions }) => (
                    <Box key={group}>
                        <Typography variant="caption" sx={{ ...sectionLabelSx, px: 2, pt: 1 }}>
                            {group}
                        </Typography>
                        {groupOptions.map((option) => (
                            <MenuItem
                                key={option}
                                // The menu stays open across toggles — picking three
                                // filters should not mean opening it three times.
                                onClick={() => toggle(option)}
                                // No ripple: the row is mostly chip, and the ripple washes
                                // a slab of grey across it on every toggle.
                                disableRipple
                                sx={{ gap: 1, py: 0.5 }}
                            >
                                <Checkbox
                                    size="small" checked={value.includes(option)}
                                    sx={{ p: 0.5 }} tabIndex={-1} disableRipple
                                />
                                <OptionContent
                                    option={option} group={group} members={members}
                                    categories={categories} flags={flags} label={labelOf(option)}
                                />
                            </MenuItem>
                        ))}
                    </Box>
                ))}
            </Box>
        </Stack>
    );

    return (
        <>
            <Button
                size="small"
                variant={value.length > 0 ? "contained" : "outlined"}
                startIcon={<FilterListIcon />}
                onClick={(e) => setAnchor(e.currentTarget)}
                sx={{ height: 40, flexShrink: 0, minWidth: 0, ...sx }}
            >
                {summariseFilters(value, labelOf, compact)}
            </Button>

            {/* Full screen on a phone and anchored above it, the same split every other
            XenBudget picker uses (see PeriodPickerDialog). */}
            {compact ? (
                <Dialog fullScreen open={open} onClose={close}>
                    <DialogTitle
                        sx={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", py: 1.5,
                        }}
                    >
                        Filters
                        <IconButton onClick={close} size="small"><CloseIcon /></IconButton>
                    </DialogTitle>
                    <DialogContent dividers sx={{ p: 0, display: "flex", flexDirection: "column" }}>
                        {body}
                    </DialogContent>
                </Dialog>
            ) : (
                <Popover
                    open={open} anchorEl={anchor} onClose={close}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    slotProps={{ paper: { sx: { width: 320, maxHeight: 480, display: "flex" } } }}
                >
                    {body}
                </Popover>
            )}
        </>
    );
}

/**
 * What an option looks like in the list. Deliberately the same chips the selection used
 * to render as tags, so a category still carries its colour and a flag its pennant.
 */
function OptionContent({
    option, group, members, categories, flags, label,
}: {
    option: string;
    group: FilterGroup;
    members: XenBudgetMember[];
    categories: XenBudgetLabel[];
    flags: XenBudgetLabel[];
    label: string;
}) {
    if (option === TYPE_EXPENSE || option === TYPE_INCOME) {
        const Icon = option === TYPE_INCOME ? TrendingUpIcon : TrendingDownIcon;
        return (
            <Stack direction="row" alignItems="center" spacing={0.75}>
                <Icon fontSize="small" color={option === TYPE_INCOME ? "success" : "inherit"} />
                <Typography variant="body2">{label}</Typography>
            </Stack>
        );
    }
    if (group === "Categories") {
        return (
            <CategoryChip name={option.slice(CATEGORY_PREFIX.length)} registry={categories} />
        );
    }
    if (group === "People") {
        const member = members.find((m) => m.user_id === option.slice(PERSON_PREFIX.length));
        return (
            <Stack direction="row" alignItems="center" spacing={0.75}>
                <Avatar
                    src={member?.avatar || undefined} alt={member?.username}
                    sx={{ width: 20, height: 20, fontSize: 10 }}
                >
                    {member?.username[0]?.toUpperCase()}
                </Avatar>
                <Typography variant="body2">{label}</Typography>
            </Stack>
        );
    }
    if (group === "Flags") {
        return <FlagChip name={option} registry={flags} />;
    }
    return <Typography variant="body2">{label}</Typography>;
}
