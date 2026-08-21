import { useState } from "react";
import {
    Avatar, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, List, ListItem, ListItemAvatar, ListItemText, Stack, Typography,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CloseIcon from "@mui/icons-material/Close";
import { useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { useXenBudgetBook } from "../../../hooks/xenbudget/useBook";
import { useXenBudgetSocket } from "../../../hooks/xenbudget/useXenBudgetSocket";
import { UserSelect } from "../../../components/UserSelect";
import type { SearchedUser } from "../../../hooks/useUserSearch";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { cardSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";

export default function BookDetail() {
    const { bookId = "" } = useParams();
    useXenBudgetSocket(bookId);
    const { enqueueSnackbar } = useSnackbar();
    const {
        book, isLoading, isError, error,
        addMembersAsync, isAddingMembers, removeMember,
    } = useXenBudgetBook(bookId);

    useTitle(book?.name || "XenBudget");

    const [addOpen, setAddOpen] = useState(false);
    const [selected, setSelected] = useState<SearchedUser[]>([]);

    const handleAdd = async () => {
        try {
            await addMembersAsync(selected.map((u) => u._id));
            setAddOpen(false);
            setSelected([]);
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to add people", { variant: "error" });
        }
    };

    if (isLoading && !book) return <LoadingSpinner message="Loading book..." />;
    if (isError) return <ErrorDisplay error={error} />;
    if (!book) return null;

    return (
        <Box sx={{ p: 2, maxWidth: 900, mx: "auto" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>{book.name}</Typography>
                <Chip size="small" label={book.default_currency} />
                <Chip size="small" variant="outlined" label={`${book.item_count ?? 0} items`} />
            </Stack>

            <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="caption" sx={sectionLabelSx}>People</Typography>
                    {book.is_creator && (
                        <Button size="small" startIcon={<PersonAddIcon />} onClick={() => setAddOpen(true)}>
                            Add
                        </Button>
                    )}
                </Stack>
                <List dense>
                    {book.members.map((m) => (
                        <ListItem
                            key={m.user_id}
                            secondaryAction={
                                book.is_creator && m.user_id !== book.created_by ? (
                                    <IconButton edge="end" size="small" onClick={() => removeMember(m.user_id)}>
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                ) : null
                            }
                        >
                            <ListItemAvatar>
                                <Avatar src={m.avatar || undefined} sx={{ width: 32, height: 32 }}>
                                    {m.username[0]?.toUpperCase()}
                                </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                                primary={m.username}
                                secondary={m.user_id === book.created_by ? "Owner" : undefined}
                            />
                        </ListItem>
                    ))}
                </List>
            </Card>

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Add people</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1 }}>
                        <UserSelect
                            value={selected}
                            onChange={setSelected}
                            label="People"
                            excludeUserIds={book.members.map((m) => m.user_id)}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button variant="contained" disabled={selected.length === 0 || isAddingMembers} onClick={handleAdd}>
                        Add
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
