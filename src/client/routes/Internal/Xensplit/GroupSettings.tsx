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
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useSnackbar } from "notistack";
import type { GroupDetailContext } from "./GroupDetail";

const ALL_CURRENCIES = ["CAD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "INR", "MXN", "BRL"];

export default function GroupSettings() {
    const { group, user, isCreator, onAddMembers, onMemberMenu, updateGroup, isUpdating, balancesData, formatCurrency } =
        useOutletContext<GroupDetailContext>();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedCurrency, setSelectedCurrency] = useState(group.default_currency || "USD");

    const handleSaveCurrency = () => {
        updateGroup(
            { default_currency: selectedCurrency },
            {
                onSuccess: () => enqueueSnackbar("Default currency updated", { variant: "success" }),
                onError: () => enqueueSnackbar("Failed to update currency", { variant: "error" }),
            } as any
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
                            <Avatar src={member.avatar || undefined} sx={{ bgcolor: "primary.main" }}>
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
        </Box>
    );
}
