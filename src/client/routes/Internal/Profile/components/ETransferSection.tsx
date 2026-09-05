import { useEffect, useState } from "react";
import { Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { ALL_CURRENCIES, DEFAULT_CURRENCY, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import { ETRANSFER_MAX, isValidEtransfer } from "../../../../../shared/etransfer";

/**
 * Where people should send this user their money. XenSplit shows it to the other party
 * when they settle up, so the currency matters as much as the handle — an Interac
 * handle that only takes CAD is worth saying out loud on a USD settlement.
 */
export default function ETransferSection() {
    const { profile, updateProfile } = useUserProfile();
    const { enqueueSnackbar } = useSnackbar();

    const [handle, setHandle] = useState("");
    const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const saved = profile?.etransfer;

    useEffect(() => {
        if (!saved) return;
        setHandle(saved.handle);
        setCurrency(saved.currency || DEFAULT_CURRENCY);
    }, [saved?.handle, saved?.currency]);

    const trimmed = handle.trim();
    const isDirty = !!saved && (trimmed !== saved.handle || currency !== saved.currency);

    const handleSave = async () => {
        if (trimmed && !isValidEtransfer(trimmed)) {
            setError("Enter a valid email or phone number");
            return;
        }
        setError("");
        setIsSaving(true);
        try {
            await updateProfile({ etransfer: { handle: trimmed, currency } });
            enqueueSnackbar(trimmed ? "E-transfer info saved" : "E-transfer info removed", { variant: "success" });
        } catch (e: any) {
            setError(e?.response?.data?.message || e?.message || "Failed to save your e-transfer info");
        }
        setIsSaving(false);
    };

    return (
        <>
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
                <TextField
                    label="E-Transfer email or phone"
                    value={handle}
                    onChange={(e) => { setHandle(e.target.value); setError(""); }}
                    error={!!error}
                    helperText={error || "Shown in XenSplit so people know where to send your money"}
                    size="small"
                    sx={{ flex: 1, minWidth: 240, maxWidth: 320 }}
                    inputProps={{ maxLength: ETRANSFER_MAX }}
                />
                <TextField
                    select
                    label="Currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={!trimmed}
                    size="small"
                    sx={{ minWidth: 110 }}
                    slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                >
                    {ALL_CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </TextField>
                <Button variant="contained" onClick={handleSave} disabled={isSaving || !isDirty} sx={{ mt: 0.5 }}>
                    {isSaving ? "Saving..." : "Save"}
                </Button>
            </Box>
            {!saved?.handle && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
                    Not set yet — people settling up with you won't know where to send the money.
                </Typography>
            )}
        </>
    );
}
