import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box,
    Typography,
    Button,
    Avatar,
    IconButton,
    FormControl,
    Select,
    MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import { useSnackbar } from "notistack";
import type { GroupDetailContext } from "./GroupDetail";
import { xsCardSx } from "./components/rowStyles";
import GroupAvatar from "./components/GroupAvatar";
import { ALL_CURRENCIES, formatCurrency } from "../../../utils/currencyUtils";

export default function GroupSettings() {
    const { group, user, isCreator, onAddMembers, onMemberMenu, updateGroup, isUpdating, uploadGroupImage, isUploadingImage, balancesData } =
        useOutletContext<GroupDetailContext>();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedCurrency, setSelectedCurrency] = useState(group.default_currency || "CAD");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        uploadGroupImage(file, {
            onSuccess: () => enqueueSnackbar("Group image updated", { variant: "success" }),
            onError: (error: Error) => enqueueSnackbar(error?.message || "Failed to update group image", { variant: "error" }),
        });
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
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Group Image — fixed, on top */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48, flexShrink: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Group Image
                </Typography>
            </Box>
            <Box sx={{ flexShrink: 0, mb: 3, bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 2 }}>
                <GroupAvatar name={group.name} imageUrl={group.image_url} size={64} borderRadius={2} fontSize="1.6rem" />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>Main image</Typography>
                    <Typography variant="caption" color="text.secondary">Shown as the group thumbnail</Typography>
                </Box>
                {isCreator && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/gif"
                            hidden
                            onChange={handleImageSelected}
                        />
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<PhotoCameraIcon />}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingImage}
                        >
                            {isUploadingImage ? "Uploading…" : "Change"}
                        </Button>
                    </>
                )}
            </Box>

            {/* Default Currency — fixed, on top */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48, flexShrink: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Default Currency
                </Typography>
                {isCreator && selectedCurrency !== group.default_currency && (
                    <Button variant="contained" size="small" onClick={handleSaveCurrency} disabled={isUpdating}>
                        Save
                    </Button>
                )}
            </Box>
            <Box sx={{ flexShrink: 0, mb: 3, bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

            {/* Members header — fixed */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48, flexShrink: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Members
                </Typography>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddMembers} size="small">
                    Add Members
                </Button>
            </Box>
            {/* Scrollable: members list */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: { xs: 1, md: 1 } }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {group.members.map((member) => {
                    const canMenu = member.user_id === user.id || (isCreator && member.user_id !== group.created_by);
                    const memberBalances = balancesData?.balances[member.user_id]?.balances ?? {};
                    const nonZero = Object.entries(memberBalances).filter(([, v]) => v !== 0);
                    return (
                        <Box
                            key={member.user_id}
                            sx={{
                                ...xsCardSx,
                                display: "grid",
                                gridTemplateColumns: "40px 1fr auto 36px",
                                alignItems: "center",
                                columnGap: 1.5,
                            }}
                        >
                            <Avatar src={member.avatar || undefined} sx={{ width: 40, height: 40 }}>
                                {member.username[0]?.toUpperCase()}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{member.username}</Typography>
                                {member.user_id === group.created_by && (
                                    <Typography variant="caption" color="text.secondary">Creator</Typography>
                                )}
                            </Box>
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                                {balancesData && (nonZero.length === 0 ? (
                                    <Typography variant="caption" sx={{ color: "text.primary" }}>
                                        Settled
                                    </Typography>
                                ) : (
                                    nonZero.map(([currency, amount]) => {
                                        const owed = (amount as number) >= 0;
                                        return (
                                            <Typography key={currency} variant="subtitle2" noWrap sx={{ fontWeight: 700, color: owed ? "success.main" : "error.main", lineHeight: 1.2 }}>
                                                {formatCurrency(Math.abs(amount as number), currency)}
                                            </Typography>
                                        );
                                    })
                                ))}
                            </Box>
                            {canMenu ? (
                                <IconButton size="small" onClick={(e) => onMemberMenu(member.user_id, e.currentTarget)}>
                                    <MoreVertIcon fontSize="small" />
                                </IconButton>
                            ) : (
                                <Box />
                            )}
                        </Box>
                    );
                })}
            </Box>
            </Box>
        </Box>
    );
}
