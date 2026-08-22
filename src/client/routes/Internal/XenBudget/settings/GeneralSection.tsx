import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
    Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    IconButton, List, ListItem, ListItemAvatar, ListItemText, MenuItem, Stack, TextField,
    Typography,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import BookBackupSection from "../components/BookBackupSection";
import { UserSelect } from "../../../../components/UserSelect";
import type { SearchedUser } from "../../../../hooks/useUserSearch";
import { ALL_CURRENCIES, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";

export default function GeneralSection() {
    const {
        book, updateBook, isUpdating, isCreator, addMembersAsync, isAddingMembers, removeMember,
        deleteBookAsync, isDeletingBook,
    } = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();

    const [name, setName] = useState(book.name);
    const [addOpen, setAddOpen] = useState(false);
    const [selected, setSelected] = useState<SearchedUser[]>([]);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const handleAdd = async () => {
        try {
            await addMembersAsync(selected.map((u) => u._id));
            setAddOpen(false);
            setSelected([]);
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to add people", { variant: "error" });
        }
    };

    const handleDelete = async () => {
        try {
            await deleteBookAsync();
            navigate("/internal/xenbudget/books");
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to delete book", { variant: "error" });
        }
    };

    return (
        <Stack spacing={2}>
            <SectionCard title="General">
                <TextField
                    fullWidth label="Name" value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                        const trimmed = name.trim();
                        if (trimmed && trimmed !== book.name) updateBook({ name: trimmed });
                        else setName(book.name);
                    }}
                />
                <TextField
                    select fullWidth label="Default currency" value={book.default_currency}
                    onChange={(e) => updateBook({ default_currency: e.target.value })}
                    disabled={isUpdating}
                    slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                >
                    {ALL_CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </TextField>
                <Typography variant="caption" color="text.secondary">
                    Months and budget periods follow each viewer&rsquo;s own timezone, set on your
                    profile — so this book reads in your local time and in everyone else&rsquo;s.
                </Typography>
            </SectionCard>

            <SectionCard
                title="People"
                description="Who can see this book and be attributed spending in it."
            >
                <Box>
                    {isCreator && (
                        <Button
                            size="small" startIcon={<PersonAddIcon />}
                            onClick={() => setAddOpen(true)}
                        >
                            Add someone
                        </Button>
                    )}
                    <List dense>
                        {book.members.map((m) => (
                            <ListItem
                                key={m.user_id}
                                secondaryAction={
                                    isCreator && m.user_id !== book.created_by ? (
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
                    {!isCreator && (
                        <Typography variant="caption" color="text.secondary">
                            Only the book owner can add or remove people.
                        </Typography>
                    )}
                </Box>
            </SectionCard>

            <SectionCard title="Backup">
                <BookBackupSection book={book} isCreator={isCreator} />
            </SectionCard>

            {isCreator && (
                <SectionCard title="Danger zone" danger>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Typography variant="body2" color="text.secondary">
                            Deleting this book also deletes every item in it.
                        </Typography>
                        <Button color="error" onClick={() => setConfirmDelete(true)}>Delete book</Button>
                    </Stack>
                </SectionCard>
            )}

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Add people</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1 }}>
                        <UserSelect
                            value={selected} onChange={setSelected} label="People"
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

            <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
                <DialogTitle>Delete &ldquo;{book.name}&rdquo;?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This permanently deletes the book and all {book.item_count ?? 0} of its items.
                        This cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button color="error" disabled={isDeletingBook} onClick={handleDelete}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
