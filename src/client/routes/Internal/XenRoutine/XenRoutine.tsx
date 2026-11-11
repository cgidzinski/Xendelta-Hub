import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import { useEffect, useState } from "react";
import { Box, Button, Container, Fab, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import AddIcon from "@mui/icons-material/Add";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import {
    useCreateRoutine, useRoutineSettings, useSaveRoutineSettings, useUpdateRoutine, type Routine,
} from "../../../hooks/xenroutine/useRoutines";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { browserTimezone } from "../../../constants/timezones";
import RoutineDialog from "./components/RoutineDialog";
import ReminderSettingsDialog from "./components/ReminderSettingsDialog";
import type { XenRoutineOutletContext } from "./outletContext";

const TABS = [
    { value: "overview", label: "Overview" },
    { value: "routines", label: "Routines" },
];

/** Layout for XenRoutine: title, the Overview/Routines tabs, and the create/edit dialog both tabs share. */
export default function XenRoutine() {
    useTitle("XenRoutine");
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const createRoutine = useCreateRoutine();
    const updateRoutine = useUpdateRoutine();

    const { profile } = useUserProfile();
    const { settings } = useRoutineSettings();
    const saveSettings = useSaveRoutineSettings();
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Reminders are scheduled in the Profile timezone. People who leave it on "follow my
    // browser" have no zone the server can see, so report the browser's once it differs.
    const browserTz = browserTimezone();
    useEffect(() => {
        if (!profile || !settings || profile.timezone) return;
        if (settings.browser_timezone !== browserTz) saveSettings.mutate({ browser_timezone: browserTz });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.timezone, settings?.browser_timezone, browserTz]);

    const [editing, setEditing] = useState<Routine | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const current = TABS.find((t) => pathname.endsWith(`/${t.value}`))?.value ?? "overview";

    const openCreate = () => { setEditing(null); setDialogOpen(true); };
    const openEdit = (routine: Routine) => { setEditing(routine); setDialogOpen(true); };
    const outletContext: XenRoutineOutletContext = { openCreate, openEdit };

    const submit = async (input: Parameters<typeof createRoutine.mutateAsync>[0]) => {
        try {
            if (editing) {
                await updateRoutine.mutateAsync({ id: editing._id, patch: input });
                enqueueSnackbar("Routine saved", { variant: "success" });
            } else {
                await createRoutine.mutateAsync(input);
                enqueueSnackbar("Routine created", { variant: "success" });
            }
        } catch (e: any) {
            enqueueSnackbar(e?.response?.data?.message ?? "Something went wrong", { variant: "error" });
            throw e;
        }
    };

    return (
        <PageContainer width="narrow">
            <PageHeader
                title="XenRoutine"
                mb={1}
                actions={
                    <>
                        <Tooltip title="Reminder settings">
                            <IconButton aria-label="Reminder settings" onClick={() => setSettingsOpen(true)}><SettingsIcon /></IconButton>
                        </Tooltip>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}
                            sx={{ display: { xs: "none", sm: "inline-flex" } }}>
                            New routine
                        </Button>
                    </>
                }
            />

            <Tabs value={current} onChange={(_, v) => navigate(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
                {TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
            </Tabs>

            <Box>
                <Outlet context={outletContext} />
            </Box>

            <Fab color="primary" aria-label="New routine" onClick={openCreate}
                sx={{ position: "fixed", right: 16, bottom: 16, display: { xs: "flex", sm: "none" } }}>
                <AddIcon />
            </Fab>

            <ReminderSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <RoutineDialog open={dialogOpen} routine={editing} onClose={() => setDialogOpen(false)} onSubmit={submit} />
        </PageContainer>
    );
}
