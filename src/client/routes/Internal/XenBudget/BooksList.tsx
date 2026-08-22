import { useState } from "react";
import {
    Box, Button, Card, CardActionArea, Dialog, DialogActions, DialogContent,
    DialogTitle, Stack, TextField, Typography, AvatarGroup, Avatar,
} from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AddIcon from "@mui/icons-material/Add";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { useXenBudgetBooks } from "../../../hooks/xenbudget/useBooks";
import { useXenBudgetBooksSocket } from "../../../hooks/xenbudget/useXenBudgetSocket";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { cardSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

export default function BooksList() {
    useTitle("XenBudget");
    useXenBudgetBooksSocket();
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const { books, isLoading, isError, error, createBookAsync, isCreating } = useXenBudgetBooks();

    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState("");

    const handleCreate = async () => {
        try {
            const book = await createBookAsync({ name: name.trim() });
            setCreateOpen(false);
            setName("");
            navigate(`/internal/xenbudget/books/${book._id}`);
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to create book", { variant: "error" });
        }
    };

    if (isLoading) return <LoadingSpinner message="Loading your books..." />;
    if (isError) return <ErrorDisplay error={error} />;

    return (
        <Box sx={{ p: 2, maxWidth: 900, mx: "auto" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">Books</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
                    New book
                </Button>
            </Stack>

            {books.length === 0 ? (
                <Box sx={emptyStateSx}>
                    <Box sx={emptyStateIconCircleSx}>
                        <AccountBalanceWalletIcon color="disabled" />
                    </Box>
                    <Typography variant="subtitle1">No books yet</Typography>
                    <Typography variant="body2" color="text.secondary">
                        A book holds your spending, your people and your budgets.
                    </Typography>
                </Box>
            ) : (
                <Stack spacing={1.25}>
                    {books.map((book) => (
                        <Card key={book._id} variant="outlined" sx={cardSx}>
                            <CardActionArea
                                onClick={() => navigate(`/internal/xenbudget/books/${book._id}`)}
                                sx={{ px: 1.75, py: 1.25 }}
                            >
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="subtitle1" noWrap>{book.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {book.item_count ?? 0} item{book.item_count === 1 ? "" : "s"}
                                            {" · "}{book.default_currency}
                                            {" · "}Created {format(new Date(book.created_at), "MMM yyyy")}
                                        </Typography>
                                    </Box>
                                    <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 13 } }}>
                                        {book.members.map((m) => (
                                            <Avatar key={m.user_id} src={m.avatar || undefined} alt={m.username}>
                                                {m.username[0]?.toUpperCase()}
                                            </Avatar>
                                        ))}
                                    </AvatarGroup>
                                </Stack>
                            </CardActionArea>
                        </Card>
                    ))}
                </Stack>
            )}

            <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>New book</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus fullWidth margin="dense" label="Name"
                        placeholder="Household 2026"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) handleCreate(); }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button variant="contained" disabled={!name.trim() || isCreating} onClick={handleCreate}>
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
