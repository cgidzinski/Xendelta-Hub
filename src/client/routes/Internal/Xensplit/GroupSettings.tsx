import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box,
    Typography,
    Button,
    Avatar,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    IconButton,
    FormControl,
    Select,
    MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useSnackbar } from "notistack";
import type { GroupDetailContext } from "./GroupDetail";
import { ALL_CURRENCIES, formatCurrency } from "../../../utils/currencyUtils";

export default function GroupSettings() {
    const { group, user, isCreator, onAddMembers, onMemberMenu, updateGroup, isUpdating, balancesData } =
        useOutletContext<GroupDetailContext>();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedCurrency, setSelectedCurrency] = useState(group.default_currency || "CAD");

    const handleExportCSV = () => {
        const memberName = (userId: string) => group.members.find((m) => m.user_id === userId)?.username ?? userId;
        const rows: string[][] = [["Date", "Title", "Paid By", "Amount", "Currency", "Split Type", "Notes", ...group.members.map((m) => m.username)]];
        for (const e of group.expenses) {
            const memberAmounts = group.members.map((m) => {
                const split = e.splits.find((s) => s.user_id === m.user_id);
                if (!split) return "";
                if (split.amount_owed !== undefined) return split.amount_owed.toFixed(2);
                if (split.percentage !== undefined) return `${split.percentage}%`;
                return (e.amount / e.splits.length).toFixed(2);
            });
            rows.push([new Date(e.date).toISOString(), e.title, memberName(e.paid_by), e.amount.toFixed(2), e.currency, e.split_type, e.notes ?? "", ...memberAmounts]);
        }
        rows.push([]);
        rows.push(["Date", "From", "To", "Amount", "Currency"]);
        for (const s of group.settlements) {
            rows.push([new Date(s.settled_at).toISOString(), memberName(s.from), memberName(s.to), s.amount.toFixed(2), s.currency]);
        }
        const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${group.name.replace(/[^a-z0-9]/gi, "_")}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSaveCurrency = () => {
        updateGroup(
            { default_currency: selectedCurrency },
            {
                onSuccess: () => enqueueSnackbar("Default currency updated", { variant: "success" }),
                onError: (error: Error) => enqueueSnackbar(error?.message || "Failed to update currency", { variant: "error" }),
            }
        );
    };

    return (
        <Box>
            {/* Members */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Members
                </Typography>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddMembers} size="small">
                    Add Members
                </Button>
            </Box>
            <List disablePadding sx={{ mb: 3 }}>
                {group.members.map((member) => (
                    <ListItem
                        key={member.user_id}
                        sx={{ bgcolor: "action.hover", borderRadius: 2, mb: 1, pr: 1, minHeight: 64 }}
                    >
                        <ListItemAvatar>
                            <Avatar src={member.avatar || undefined}>
                                {member.username[0]?.toUpperCase()}
                            </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                            primary={member.username}
                            secondary={member.user_id === group.created_by ? "Creator" : ""}
                        />
                        {/* Inline balance */}
                        {balancesData && (() => {
                            const memberBalances = balancesData.balances[member.user_id]?.balances ?? {};
                            const nonZero = Object.entries(memberBalances).filter(([, v]) => v !== 0);
                            if (nonZero.length === 0) {
                                return (
                                    <Typography variant="caption" sx={{ color: "success.main", fontWeight: 600, mr: 1, whiteSpace: "nowrap" }}>
                                        Settled
                                    </Typography>
                                );
                            }
                            return (
                                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", mr: 1 }}>
                                    {nonZero.map(([currency, amount]) => (
                                        <Typography
                                            key={currency}
                                            variant="caption"
                                            sx={{ fontWeight: 700, whiteSpace: "nowrap", color: (amount as number) >= 0 ? "success.main" : "error.main" }}
                                        >
                                            {(amount as number) >= 0 ? "+" : ""}{formatCurrency(amount as number, currency)}
                                        </Typography>
                                    ))}
                                </Box>
                            );
                        })()}
                        {(member.user_id === user.id ||
                            (isCreator && member.user_id !== group.created_by)) && (
                                <IconButton onClick={(e) => onMemberMenu(member.user_id, e.currentTarget)}>
                                    <MoreVertIcon />
                                </IconButton>
                            )}
                    </ListItem>
                ))}
            </List>

            {/* Default Currency */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Default Currency
                </Typography>
                {isCreator && selectedCurrency !== group.default_currency && (
                    <Button variant="contained" size="small" onClick={handleSaveCurrency} disabled={isUpdating}>
                        Save
                    </Button>
                )}
            </Box>
            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>Primary currency</Typography>
                    <Typography variant="caption" color="text.secondary">Default when adding expenses</Typography>
                </Box>
                {isCreator ? (
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                        <Select
                            value={selectedCurrency}
                            onChange={(e) => setSelectedCurrency(e.target.value)}
                        >
                            {ALL_CURRENCIES.map((c) => (
                                <MenuItem key={c} value={c}>{c}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                ) : (
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{group.default_currency}</Typography>
                )}
            </Box>

            {/* Export */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 3, mb: 2, minHeight: 48 }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>Export</Typography>
                    <Typography variant="caption" color="text.secondary">Download all expenses and settlements</Typography>
                </Box>
                <Button variant="outlined" size="small" startIcon={<FileDownloadIcon />} onClick={handleExportCSV}>
                    Export CSV
                </Button>
            </Box>
        </Box>
    );
}
