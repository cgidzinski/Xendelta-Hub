import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
    List, ListItem, ListItemAvatar, ListItemText, Typography,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import { UserSelect } from "../../../../components/UserSelect";
import type { SearchedUser } from "../../../../hooks/useUserSearch";

export default function PeopleSection() {
    const {
        book, isCreator, addMembersAsync, isAddingMembers, removeMember,
    } = useOutletContext<BookDetailContext>();
    const { enqueueSnackbar } = useSnackbar();
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

    return (
        <>
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
        </>
    );
}
