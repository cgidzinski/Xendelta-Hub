import { useState } from "react";
import { Box, Button, IconButton, Stack, Tab, Tabs, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BarChartIcon from "@mui/icons-material/BarChart";
import InsightsIcon from "@mui/icons-material/Insights";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SettingsIcon from "@mui/icons-material/Settings";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTitle } from "../../../hooks/useTitle";
import { useXenBudgetBook } from "../../../hooks/xenbudget/useBook";
import { useXenBudgetSocket } from "../../../hooks/xenbudget/useXenBudgetSocket";
import { useXenBudgetItemMutations } from "../../../hooks/xenbudget/useItems";
import type {
    XenBudgetBook, XenBudgetItem, CreateItemInput, UpdateBookInput,
} from "../../../hooks/xenbudget/types";
import ItemForm from "./components/ItemForm";
import ItemPreviewModal from "./components/ItemPreviewModal";
import ImportWizard from "./components/ImportWizard";
import { useSnackbar } from "notistack";
import { TAB_PATHS, activeIndex } from "./navigation";
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
    /** Open the read-only preview before the edit form. */
    onPreviewItem: (item: XenBudgetItem) => void;
    updateBook: (input: UpdateBookInput) => void;
    isUpdating: boolean;
    addMembersAsync: (memberIds: string[]) => Promise<unknown>;
    isAddingMembers: boolean;
    removeMember: (userId: string) => void;
    deleteBookAsync: () => Promise<unknown>;
    isDeletingBook: boolean;
}

export default function BookDetail() {
    const { bookId = "" } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    useXenBudgetSocket(bookId);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    const {
        book, isLoading, isError, error,
        updateBook, isUpdating,
        addMembersAsync, isAddingMembers, removeMember,
        deleteBookAsync, isDeletingBook,
    } = useXenBudgetBook(bookId);

    const {
        createItemAsync, isCreating, updateItemAsync, isUpdating: isUpdatingItem,
        deleteItemAsync, isDeleting,
        uploadItemImages, deleteItemImage, isDeletingImage,
    } = useXenBudgetItemMutations(bookId);

    useTitle("XenBudget");

    const { enqueueSnackbar } = useSnackbar();

    const [formOpen, setFormOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editing, setEditing] = useState<XenBudgetItem | null>(null);
    const [previewing, setPreviewing] = useState<XenBudgetItem | null>(null);
    const [addImages, setAddImages] = useState<File[]>([]);
    // Undefined lets the server pick (the book's default, or the only one present);
    // choosing from the switcher pins it for this session.
    const [currency, setCurrency] = useState<string | undefined>(undefined);

    // Tab order matches the <Tab> order below; the active tab comes from the URL rather
    // than being stored, so a deep link or the back button lands on the right one. See
    // navigation.ts for why this is a segment match and not a suffix.
    const activeTab = activeIndex(location.pathname, TAB_PATHS);

    if (isLoading && !book) return <LoadingSpinner message="Loading book..." />;
    if (isError) return <ErrorDisplay error={error} />;
    if (!book) return null;

    const outletContext: BookDetailContext = {
        book,
        isCreator: book.is_creator,
        currency: currency ?? book.default_currency,
        onCurrencyChange: setCurrency,
        onAddItem: () => { setEditing(null); setAddImages([]); setFormOpen(true); },
        onEditItem: (item) => { setEditing(item); setFormOpen(true); },
        onPreviewItem: (item) => setPreviewing(item),
        updateBook,
        isUpdating,
        addMembersAsync,
        isAddingMembers,
        removeMember,
        deleteBookAsync,
        isDeletingBook,
    };

    const handleSubmit = async (input: CreateItemInput) => {
        const saved = editing
            ? await updateItemAsync({ itemId: editing._id, input })
            : await createItemAsync(input);
        if (addImages.length > 0 && saved?._id) {
            try {
                await uploadItemImages({ itemId: saved._id, files: addImages });
            } catch {
                enqueueSnackbar("Item saved but some images failed to upload", { variant: "warning" });
            }
        }
        setAddImages([]);
    };

    return (
        <Box sx={{ height: { xs: "calc(100dvh - 56px)", sm: "calc(100dvh - 64px)" }, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Box sx={{ borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pt: 1.5, pb: 1 }}>
                    <Tooltip title="All books">
                        <IconButton size="small" onClick={() => navigate("/internal/xenbudget/books")}>
                            <ArrowBackIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Typography variant="h6" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>{book.name}</Typography>
                    <Button
                        size="small" variant="contained" startIcon={<AddIcon />}
                        onClick={outletContext.onAddItem}
                    >
                        New
                    </Button>
                    <Button
                        size="small" variant="outlined" startIcon={<UploadFileIcon />}
                        onClick={() => setImportOpen(true)}
                    >
                        Import
                    </Button>
                </Stack>
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => navigate(`/internal/xenbudget/books/${bookId}/${TAB_PATHS[v]}`)}
                    variant="fullWidth"
                >
                    <Tab icon={<InsightsIcon sx={{ fontSize: 20 }} />} label={isMobile ? undefined : "Overview"} aria-label="Overview" />
                    <Tab icon={<ReceiptLongIcon sx={{ fontSize: 20 }} />} label={isMobile ? undefined : "Items"} aria-label="Items" />
                    <Tab icon={<BarChartIcon sx={{ fontSize: 20 }} />} label={isMobile ? undefined : "Report"} aria-label="Report" />
                    <Tab icon={<SettingsIcon sx={{ fontSize: 20 }} />} label={isMobile ? undefined : "Settings"} aria-label="Settings" />
                </Tabs>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", width: "100%", maxWidth: 1200, mx: "auto" }}>
                <Outlet context={outletContext} />
            </Box>

            <ItemForm
                open={formOpen}
                onClose={() => { setFormOpen(false); setAddImages([]); }}
                book={book}
                item={editing}
                onSubmit={handleSubmit}
                isSubmitting={isCreating || isUpdatingItem}
                onDelete={editing ? () => deleteItemAsync(editing._id) : undefined}
                isDeleting={isDeleting}
                images={addImages}
                onImagesChange={setAddImages}
                onDeleteExistingImage={editing ? (imageId) => { deleteItemImage({ itemId: editing._id, imageId }); } : undefined}
                isDeletingImage={isDeletingImage}
            />

            <ItemPreviewModal
                open={!!previewing}
                onClose={() => setPreviewing(null)}
                book={book}
                item={previewing}
                onEdit={(it) => { setPreviewing(null); setEditing(it); setFormOpen(true); }}
            />

            <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} book={book} />
        </Box>
    );
}
