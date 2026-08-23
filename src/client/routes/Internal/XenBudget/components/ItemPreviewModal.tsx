import {
    Avatar, AvatarGroup, Box, Button, Dialog, DialogContent,
    DialogTitle, IconButton, Stack, Typography, alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import useMediaQuery from "@mui/material/useMediaQuery";
import type {
    XenBudgetBook, XenBudgetItem, XenBudgetMember,
} from "../../../../hooks/xenbudget/types";
import { useXenBudgetItemImageUrls } from "../../../../hooks/xenbudget/useItems";
import { formatCurrency } from "../currency";
import { CategoryChip, FlagChip } from "./LabelChip";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";

interface ItemPreviewModalProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
    item: XenBudgetItem | null;
    onEdit: (item: XenBudgetItem) => void;
}

/** Read-only preview of an item, opened before the edit form. */
export default function ItemPreviewModal({ open, onClose, book, item, onEdit }: ItemPreviewModalProps) {
    const isMobile = useMediaQuery("(max-width:600px)");
    const { data: imageUrls } = useXenBudgetItemImageUrls(book._id, item?._id, item?.images?.length ?? 0);

    const isIncome = item?.type === "income";
    const people = (item?.shares ?? [])
        .map((s) => book.members.find((m) => m.user_id === s.user_id))
        .filter((m): m is XenBudgetMember => !!m);

    return (
        <Dialog
            fullWidth maxWidth="sm" fullScreen={isMobile} open={open} onClose={onClose}
            slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 2 } } }}
        >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 3, pt: 2 }}>
                <DialogTitle sx={{ fontWeight: 700, p: 0 }}>Item</DialogTitle>
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </Box>

            {item && (
                <DialogContent sx={{ pt: 2 }}>
                    <Stack spacing={2}>
                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25 }}>
                            <Box
                                sx={{
                                    width: 40, height: 40, borderRadius: 1.5, flexShrink: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    bgcolor: (theme) => alpha(
                                        isIncome ? theme.palette.success.main : theme.palette.error.main, 0.15,
                                    ),
                                    color: isIncome ? "success.main" : "error.main",
                                }}
                            >
                                {isIncome ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
                            </Box>
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                                    {item.description}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {isIncome ? "Income" : "Expense"} · {new Date(item.date).toLocaleDateString(undefined, {
                                        year: "numeric", month: "short", day: "numeric",
                                    })}
                                </Typography>
                            </Box>
                            <Typography
                                variant="h6" sx={{ fontWeight: 700, flexShrink: 0, color: isIncome ? "success.main" : "error.main" }}
                            >
                                {isIncome ? "+" : "−"}{formatCurrency(item.amount, item.currency)}
                            </Typography>
                        </Box>

                        {(item.categories.length > 0 || item.flags.length > 0) && (
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                                {item.categories.map((c) => (
                                    <CategoryChip key={c.name} name={c.name} registry={book.categories} />
                                ))}
                                {item.flags.map((t) => (
                                    <FlagChip key={t} name={t} registry={book.flags} />
                                ))}
                            </Stack>
                        )}

                        {item.notes && (
                            <Box>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                                    Notes
                                </Typography>
                                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, bgcolor: "action.hover", px: 1.5, py: 1.25 }}>
                                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                                        {item.notes}
                                    </Typography>
                                </Box>
                            </Box>
                        )}

                        {people.length > 0 && (
                            <Box>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                                    Attributed to
                                </Typography>
                                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, bgcolor: "action.hover", px: 1.5, py: 1.25 }}>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                        <AvatarGroup max={5}>
                                            {people.map((m) => (
                                                <Avatar key={m.user_id} src={m.avatar || undefined} alt={m.username}>
                                                    {m.username[0]?.toUpperCase()}
                                                </Avatar>
                                            ))}
                                        </AvatarGroup>
                                        <Typography variant="body2" color="text.secondary">
                                            {people.map((m) => m.username).join(", ")}
                                        </Typography>
                                    </Stack>
                                </Box>
                            </Box>
                        )}

                        {(item.images?.length ?? 0) > 0 && (
                            <Box>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                                    Photos
                                </Typography>
                                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, bgcolor: "action.hover", px: 1.5, py: 1.25 }}>
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                                        {item.images!.map((img) => {
                                            const urlEntry = imageUrls?.find((u) => u._id === img._id);
                                            return (
                                                <Box key={img._id} sx={{ width: 80, height: 80, flexShrink: 0 }}>
                                                    {urlEntry ? (
                                                        <Box
                                                            component="img" src={urlEntry.signedUrl}
                                                            sx={{ width: 80, height: 80, objectFit: "cover", borderRadius: 1, display: "block" }}
                                                        />
                                                    ) : (
                                                        <Box sx={{ width: 80, height: 80, bgcolor: "background.paper", borderRadius: 1 }} />
                                                    )}
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
            )}

            {item && (
                <Box sx={{ px: 3, pb: 3 }}>
                    <Button fullWidth variant="contained" onClick={() => onEdit(item)}>
                        Edit
                    </Button>
                </Box>
            )}
        </Dialog>
    );
}
