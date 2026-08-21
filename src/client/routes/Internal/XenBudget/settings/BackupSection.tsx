import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
    Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Stack, Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import BookBackupSection from "../components/BookBackupSection";

export default function BackupSection() {
    const { book, isCreator, deleteBookAsync, isDeletingBook } = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const [confirmDelete, setConfirmDelete] = useState(false);

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
