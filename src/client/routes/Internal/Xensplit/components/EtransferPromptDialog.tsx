import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Checkbox, Dialog, DialogActions, FormControlLabel, Typography } from "@mui/material";

// A plain flag, not the timestamp-with-TTL the PWA prompts use: "don't ask me again"
// here means never, and it's per-device because that's where localStorage lives.
const DISMISS_KEY = "xensplit_etransferPrompt_dismissed";

export function isEtransferPromptDismissed(): boolean {
    return localStorage.getItem(DISMISS_KEY) === "true";
}

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Nudges anyone whose profile has no e-transfer destination: without one, the people
 * settling up with them have nowhere to send the money. Reappears every time they open
 * XenSplit until they either set one or tick the box.
 */
export default function EtransferPromptDialog({ open, onClose }: Props) {
    const navigate = useNavigate();
    const [dontAsk, setDontAsk] = useState(false);

    const close = () => {
        if (dontAsk) localStorage.setItem(DISMISS_KEY, "true");
        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="xs" open={open} onClose={close} PaperProps={{ sx: { borderRadius: 3 } }}>
            <Box sx={{ p: 3, pb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Add your e-transfer info</Typography>
                <Typography variant="body2" color="text.secondary">
                    You haven't set an e-transfer email or phone number. Without one, people settling
                    up with you won't know where to send the money.
                </Typography>
                <FormControlLabel
                    sx={{ mt: 1.5 }}
                    control={<Checkbox size="small" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />}
                    label={<Typography variant="body2">Don't ask me again</Typography>}
                />
            </Box>
            <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                <Button onClick={close}>Continue</Button>
                <Button
                    variant="contained"
                    onClick={() => { close(); navigate("/internal/profile"); }}
                >
                    Go to Profile
                </Button>
            </DialogActions>
        </Dialog>
    );
}
