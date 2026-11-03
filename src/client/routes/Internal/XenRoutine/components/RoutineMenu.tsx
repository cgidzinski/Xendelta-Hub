import { useState } from "react";
import { IconButton, Menu, MenuItem } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useAuth } from "../../../../contexts/AuthContext";
import {
    useDeleteRoutine, usePostponeRoutine, useSetRoutineNotifications, useShareRoutine, useUnshareRoutine,
    useUpdateRoutine, type Routine,
} from "../../../../hooks/xenroutine/useRoutines";
import NotificationOptions from "./NotificationOptions";
import ShareDialog from "./ShareDialog";
import HistoryDialog from "./HistoryDialog";

const POSTPONE_PRESETS = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
];

interface Props {
    routine: Routine;
    /** Overview cards get the quick actions; the Routines tab gets the management ones. */
    variant: "overview" | "routines";
    onEdit?: (routine: Routine) => void;
    /** Postponing moves the real due date, so projected future occurrences don't offer it. */
    allowPostpone?: boolean;
}

/** The ⋮ button for a routine, with its menu and every dialog the menu can open. */
export default function RoutineMenu({ routine, variant, onEdit, allowPostpone = true }: Props) {
    const { enqueueSnackbar } = useSnackbar();
    const confirm = useConfirm();
    const { user } = useAuth();

    const updateRoutine = useUpdateRoutine();
    const deleteRoutine = useDeleteRoutine();
    const postponeRoutine = usePostponeRoutine();
    const setNotifications = useSetRoutineNotifications();
    const shareRoutine = useShareRoutine();
    const unshareRoutine = useUnshareRoutine();

    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [postponeAnchor, setPostponeAnchor] = useState<HTMLElement | null>(null);
    const [notifOpen, setNotifOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const run = async (p: Promise<unknown>, ok: string) => {
        try {
            await p;
            enqueueSnackbar(ok, { variant: "success" });
        } catch (e: any) {
            enqueueSnackbar(e?.response?.data?.message ?? "Something went wrong", { variant: "error" });
            throw e;
        }
    };
    const quiet = (p: Promise<unknown>, ok: string) => run(p, ok).catch(() => {});
    const closeMenu = () => setAnchor(null);

    return (
        <>
            <IconButton aria-label="More actions" size="small" onClick={(e) => setAnchor(e.currentTarget)}>
                <MoreVertIcon />
            </IconButton>

            <Menu open={!!anchor} anchorEl={anchor} onClose={closeMenu}>
                {variant === "overview" && allowPostpone && (
                    <MenuItem onClick={() => { setPostponeAnchor(anchor); closeMenu(); }}>Postpone…</MenuItem>
                )}
                {variant === "routines" && routine.is_owner && (
                    <MenuItem onClick={() => { closeMenu(); onEdit?.(routine); }}>Edit</MenuItem>
                )}
                <MenuItem onClick={() => { closeMenu(); setHistoryOpen(true); }}>History &amp; notes</MenuItem>
                <MenuItem onClick={() => { closeMenu(); setNotifOpen(true); }}>Notification options</MenuItem>
                {variant === "routines" && routine.is_owner && (
                    <MenuItem onClick={() => { closeMenu(); setShareOpen(true); }}>Share</MenuItem>
                )}
                {variant === "routines" && routine.is_owner && (
                    <MenuItem onClick={() => {
                        closeMenu();
                        quiet(updateRoutine.mutateAsync({ id: routine._id, patch: { enabled: !routine.enabled } }), routine.enabled ? "Paused" : "Resumed");
                    }}>{routine.enabled ? "Pause" : "Resume"}</MenuItem>
                )}
                {variant === "routines" && !routine.is_owner && (
                    <MenuItem onClick={async () => {
                        closeMenu();
                        if (await confirm({ title: "Leave routine", message: `Stop seeing “${routine.name}”?`, confirmLabel: "Leave" })) {
                            quiet(unshareRoutine.mutateAsync({ id: routine._id, userId: user!.id }), "Left routine");
                        }
                    }}>Leave</MenuItem>
                )}
                {variant === "routines" && routine.is_owner && (
                    <MenuItem sx={{ color: "error.main" }} onClick={async () => {
                        closeMenu();
                        if (await confirm({ title: "Delete routine", message: `Delete “${routine.name}” and its history?` })) {
                            quiet(deleteRoutine.mutateAsync(routine._id), "Routine deleted");
                        }
                    }}>Delete</MenuItem>
                )}
            </Menu>

            <Menu open={!!postponeAnchor} anchorEl={postponeAnchor} onClose={() => setPostponeAnchor(null)}>
                {POSTPONE_PRESETS.map((p) => (
                    <MenuItem key={p.days} onClick={() => {
                        setPostponeAnchor(null);
                        quiet(postponeRoutine.mutateAsync({ id: routine._id, days: p.days }), `Postponed ${p.label}`);
                    }}>{p.label}</MenuItem>
                ))}
            </Menu>

            <NotificationOptions
                open={notifOpen}
                routine={routine}
                onClose={() => setNotifOpen(false)}
                onSave={(v) => run(setNotifications.mutateAsync({ id: routine._id, ...v }), "Notification options saved")}
            />
            <ShareDialog
                open={shareOpen}
                routine={routine}
                onClose={() => setShareOpen(false)}
                onAdd={(userIds) => run(shareRoutine.mutateAsync({ id: routine._id, userIds }), "Shared")}
                onRemove={(userId) => run(unshareRoutine.mutateAsync({ id: routine._id, userId }), "Removed")}
            />
            <HistoryDialog open={historyOpen} routine={routine} onClose={() => setHistoryOpen(false)} />
        </>
    );
}
