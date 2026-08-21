import { useState } from "react";
import { Box, Button, Chip, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import InsightsIcon from "@mui/icons-material/Insights";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SavingsIcon from "@mui/icons-material/Savings";
import SettingsIcon from "@mui/icons-material/Settings";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTitle } from "../../../hooks/useTitle";
import { useXenBudgetBook } from "../../../hooks/xenbudget/useBook";
import { useXenBudgetSocket } from "../../../hooks/xenbudget/useXenBudgetSocket";
import { useXenBudgetItemMutations } from "../../../hooks/xenbudget/useItems";
import type {
    XenBudgetBook, XenBudgetItem, CreateItemInput, UpdateBookInput,
} from "../../../hooks/xenbudget/types";
import ItemForm from "./components/ItemForm";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";

/**
 * Everything the child tabs need. BookDetail is a "fat" layout route in the same shape as
 * Xensplit's GroupDetail: it owns the book query, every dialog, and all the mutations,
 * and the tabs stay presentational and never fetch for themselves.
 */
export interface BookDetailContext {
    book: XenBudgetBook;
    /** True when the signed-in user owns the book: gates people management and deletion. */
    isCreator: boolean;
    /**
     * Which currency the tallies are scoped to. Amounts in different currencies can't be
     * added together, so every summary is for one currency at a time.
     */
    currency: string;
    onCurrencyChange: (currency: string) => void;
    onAddItem: () => void;
    onEditItem: (item: XenBudgetItem) => void;
    updateBook: (input: UpdateBookInput) => void;
    isUpdating: boolean;
    addMembersAsync: (memberIds: string[]) => Promise<unknown>;
    isAddingMembers: boolean;
    removeMember: (userId: string) => void;
    deleteBookAsync: () => Promise<unknown>;
    isDeletingBook: boolean;
}

// Tab order must match the <Tab> order below; the active tab is derived from the URL
// rather than stored, so a deep link or a back button lands on the right tab.
const TAB_PATHS = ["overview", "items", "budgets", "settings"];

export default function BookDetail() {
    const { bookId = "" } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    useXenBudgetSocket(bookId);

    const {
        book, isLoading, isError, error,
        updateBook, isUpdating,
        addMembersAsync, isAddingMembers, removeMember,
        deleteBookAsync, isDeletingBook,
    } = useXenBudgetBook(bookId);

    const {
        createItemAsync, isCreating, updateItemAsync, isUpdating: isUpdatingItem,
        deleteItemAsync, isDeleting,
    } = useXenBudgetItemMutations(bookId);

    useTitle(book?.name || "XenBudget");

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<XenBudgetItem | null>(null);
    // Undefined lets the server pick (the book's default, or the only one present);
    // choosing from the switcher pins it for this session.
    const [currency, setCurrency] = useState<string | undefined>(undefined);

    const tabIndex = TAB_PATHS.findIndex((p) => location.pathname.endsWith(`/${p}`));
    const activeTab = tabIndex === -1 ? false : tabIndex;

    if (isLoading && !book) return <LoadingSpinner message="Loading book..." />;
    if (isError) return <ErrorDisplay error={error} />;
    if (!book) return null;

    const outletContext: BookDetailContext = {
        book,
        isCreator: book.is_creator,
        currency: currency ?? book.default_currency,
        onCurrencyChange: setCurrency,
        onAddItem: () => { setEditing(null); setFormOpen(true); },
        onEditItem: (item) => { setEditing(item); setFormOpen(true); },
        updateBook,
        isUpdating,
        addMembersAsync,
        isAddingMembers,
        removeMember,
        deleteBookAsync,
        isDeletingBook,
    };

    const handleSubmit = async (input: CreateItemInput) => {
        if (editing) await updateItemAsync({ itemId: editing._id, input });
        else await createItemAsync(input);
    };

    return (
        <Box>
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pt: 1.5, pb: 1 }}>
                    <Tooltip title="All books">
                        <IconButton size="small" onClick={() => navigate("/internal/xenbudget/books")}>
                            <ArrowBackIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Typography variant="h6" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>{book.name}</Typography>
                    <Chip size="small" label={book.default_currency} />
                    <Button
                        size="small" variant="contained" startIcon={<AddIcon />}
                        onClick={outletContext.onAddItem}
                    >
                        Add
                    </Button>
                </Stack>
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => navigate(`/internal/xenbudget/books/${bookId}/${TAB_PATHS[v]}`)}
                    variant="fullWidth"
                >
                    <Tab icon={<InsightsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Overview" />
                    <Tab icon={<ReceiptLongIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Items" />
                    <Tab icon={<SavingsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Budgets" />
                    <Tab icon={<SettingsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Settings" />
                </Tabs>
            </Box>

            <Box sx={{ maxWidth: 900, mx: "auto" }}>
                <Outlet context={outletContext} />
            </Box>

            <ItemForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                book={book}
                item={editing}
                onSubmit={handleSubmit}
                isSubmitting={isCreating || isUpdatingItem}
                onDelete={editing ? () => deleteItemAsync(editing._id) : undefined}
                isDeleting={isDeleting}
            />
        </Box>
    );
}
