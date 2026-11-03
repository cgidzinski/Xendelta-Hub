import { useState } from "react";
import { Box, Button, Container, Fab, Stack, Tab, Tabs, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { useCreateRoutine, useUpdateRoutine, type Routine } from "../../../hooks/xenroutine/useRoutines";
import RoutineDialog from "./components/RoutineDialog";
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
        <Container maxWidth="md" sx={{ mt: 3, mb: 10 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>XenRoutine</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}
                    sx={{ display: { xs: "none", sm: "inline-flex" } }}>
                    New routine
                </Button>
            </Stack>

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

            <RoutineDialog open={dialogOpen} routine={editing} onClose={() => setDialogOpen(false)} onSubmit={submit} />
        </Container>
    );
}
