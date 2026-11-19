import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import RepeatIcon from "@mui/icons-material/Repeat";
import { useSnackbar } from "notistack";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import UserAvatar from "../../../../components/user/UserAvatar";
import UserName from "../../../../components/user/UserName";
import { useExpenseImageUrls } from "../../../../hooks/xensplit/useExpenses";
import type { XenSplit, XenSplitExpense } from "../../../../hooks/xensplit/types";
import { formatCurrency } from "../../../../utils/currencyUtils";
import { recurringSeriesCaption } from "./ExpenseListItem";

interface ViewExpenseDialogProps {
  /** The expense being looked at; the dialog is closed when `open` is false. */
  expense: XenSplitExpense | null;
  open: boolean;
  onClose: () => void;
  group: XenSplit;
  finalExpenseIds: Set<string>;
  canEditExpense: (expense: XenSplitExpense) => boolean;
  deleteExpense: (expenseId: string, options: { onSuccess: () => void; onError: (error: Error) => void }) => void;
  isDeletingExpense: boolean;
  onDuplicate: (expense: XenSplitExpense) => void;
  /** Close this dialog and open the edit form. */
  onEdit: (expense: XenSplitExpense) => void;
  /** Jump to another expense (a recurring occurrence's original). */
  onViewExpense: (expense: XenSplitExpense) => void;
  /** An occurrence was deleted from here. */
  onDeleted: () => void;
  onOpenImage: (url: string) => void;
}

/** The read-only view of one expense: amount, who paid, the split, photos, and the actions that apply to it. */
export default function ViewExpenseDialog({
  expense,
  open,
  onClose,
  group,
  finalExpenseIds,
  canEditExpense,
  deleteExpense,
  isDeletingExpense,
  onDuplicate,
  onEdit,
  onViewExpense,
  onDeleted,
  onOpenImage,
}: ViewExpenseDialogProps) {
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const { data: imageUrls = [] } = useExpenseImageUrls(group._id, expense?._id, expense?.images?.length ?? 0);
  const findSeriesForGenesis = (expenseId: string) =>
    group.recurring_expenses?.find((r) => r.genesis_expense_id === expenseId);

  return (
    <Dialog fullWidth maxWidth="xs" open={open} onClose={onClose}>
      {expense &&
        (() => {
          const e = expense;
          const payer = group.members.find((m) => m.user_id === e.paid_by);
          const splitTypeLabel =
            e.split_type === "equal" ? "Equal split" : e.split_type === "exact" ? "Exact amounts" : "By percentage";
          return (
            <>
              <Box sx={{ position: "relative", pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                <IconButton onClick={() => onClose()} size="small" sx={{ position: "absolute", top: 12, right: 12 }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
                <Typography variant="h4" sx={{ fontWeight: 800, color: "success.main", letterSpacing: "-0.02em" }}>
                  {formatCurrency(e.amount, e.currency)}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, mt: 0.5 }}>
                  {e.title}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 0.5,
                    mt: 1,
                  }}
                >
                  <Chip label={splitTypeLabel} size="small" sx={{ fontWeight: 600, fontSize: "0.7rem" }} />
                  {e.category && (
                    <Chip
                      label={e.category}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 500, fontSize: "0.7rem" }}
                    />
                  )}
                  {e.on_hold && (
                    <Chip
                      icon={<PauseCircleOutlineIcon sx={{ fontSize: "14px !important" }} />}
                      label="On Hold"
                      size="small"
                      color="warning"
                      sx={{ fontWeight: 600, fontSize: "0.7rem" }}
                    />
                  )}
                  {(() => {
                    const series = findSeriesForGenesis(e._id);
                    if (!series && !e.recurring_id) return null;
                    const isFinal = finalExpenseIds.has(e._id);
                    const label = series ? `Recurring · ${recurringSeriesCaption(series)}` : "Recurring";
                    return (
                      <Chip
                        icon={<RepeatIcon sx={{ fontSize: "14px !important" }} />}
                        label={isFinal ? `${label} · Final` : label}
                        size="small"
                        color="secondary"
                        sx={{ fontWeight: 600, fontSize: "0.7rem" }}
                      />
                    );
                  })()}
                </Box>
              </Box>

              <DialogContent sx={{ px: 3, pt: 1, pb: 2 }}>
                {/* Paid by */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    bgcolor: "action.hover",
                    borderRadius: 2,
                    px: 2,
                    py: 1.25,
                    mb: 1.5,
                  }}
                >
                  <UserAvatar user={payer} sx={{ width: 32, height: 32, flexShrink: 0 }}>
                    {payer?.username?.[0]?.toUpperCase()}
                  </UserAvatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
                      Paid by
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      <UserName user={payer} fallback="Unknown" />
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                      {new Date(e.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                      {new Date(e.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </Typography>
                  </Box>
                </Box>

                {/* Notes */}
                {e.notes && (
                  <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.25, mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>
                      Notes
                    </Typography>
                    <Typography variant="body2">{e.notes}</Typography>
                  </Box>
                )}

                {/* Splits */}
                {e.splits && e.splits.length > 0 && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <SectionLabel sx={{ color: "text.secondary", mb: 1 }}>Split</SectionLabel>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                      {e.splits.map((split) => {
                        const member = group.members.find((m) => m.user_id === split.user_id);
                        return (
                          <Box key={split.user_id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <UserAvatar user={member} sx={{ width: 28, height: 28, fontSize: 11 }}>
                              {member?.username?.[0]?.toUpperCase()}
                            </UserAvatar>
                            <Typography variant="body2" sx={{ flexGrow: 1 }}>
                              <UserName user={member} fallback="?" />
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {e.split_type === "percent" && split.percentage != null
                                ? `${split.percentage.toFixed(2)}% · ${formatCurrency(split.amount_owed ?? 0, e.currency)}`
                                : formatCurrency(split.amount_owed ?? e.amount / e.splits.length, e.currency)}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </>
                )}

                {/* Images */}
                {e.images && e.images.length > 0 && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <SectionLabel sx={{ color: "text.secondary", mb: 1 }}>Photos</SectionLabel>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      {e.images.map((img) => {
                        const urlEntry = imageUrls.find((u) => u._id === img._id);
                        return (
                          <Box
                            key={img._id}
                            sx={{
                              width: 80,
                              height: 80,
                              flexShrink: 0,
                              borderRadius: 1,
                              overflow: "hidden",
                              cursor: urlEntry ? "pointer" : "default",
                              bgcolor: "action.hover",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            onClick={() => urlEntry && onOpenImage(urlEntry.signedUrl)}
                          >
                            {urlEntry ? (
                              <Box
                                component="img"
                                src={urlEntry.thumbUrl ?? urlEntry.signedUrl}
                                sx={{ width: 80, height: 80, objectFit: "cover", display: "block" }}
                              />
                            ) : (
                              <CircularProgress size={20} />
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </>
                )}
              </DialogContent>

              <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: "wrap", rowGap: 1 }}>
                {e.deleted_at == null && !e.recurring_id && (
                  <Button
                    fullWidth
                    variant="text"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => onDuplicate(e)}
                    sx={{ flex: "1 1 100%" }}
                  >
                    Duplicate
                  </Button>
                )}
                {/* A deleted expense cannot be edited - the server rejects it - so offer
                    nothing but the route back. */}
                {e.deleted_at != null ? (
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", width: "100%" }}>
                    This expense was deleted. It is kept as group history and cannot be restored.
                  </Typography>
                ) : e.recurring_id ? (
                  (() => {
                    const genesisExpense = group.expenses.find((x) => x._id === e.recurring_id);
                    const canDelete = canEditExpense(e);
                    return (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
                        {genesisExpense ? (
                          <Button
                            fullWidth
                            variant="outlined"
                            color="secondary"
                            startIcon={<RepeatIcon />}
                            onClick={() => onViewExpense(genesisExpense)}
                          >
                            View Original Expense
                          </Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                            Created by a recurring expense that no longer exists
                          </Typography>
                        )}
                        {canDelete && (
                          <Button
                            fullWidth
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            disabled={isDeletingExpense}
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Delete this occurrence?",
                                message:
                                  "The recurring schedule is unaffected — future occurrences will still be created.",
                              });
                              if (ok) {
                                deleteExpense(e._id, {
                                  onSuccess: () => {
                                    enqueueSnackbar("Expense deleted", { variant: "success" });
                                    onDeleted();
                                  },
                                  onError: (error: Error) => {
                                    enqueueSnackbar(error?.message || "Failed to delete expense", {
                                      variant: "error",
                                    });
                                  },
                                });
                              }
                            }}
                          >
                            Delete This Occurrence
                          </Button>
                        )}
                      </Box>
                    );
                  })()
                ) : canEditExpense(e) ? (
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => {
                      onEdit(e);
                    }}
                  >
                    Edit Expense
                  </Button>
                ) : (
                  /* Mirrors the server's edit check so a non-editor learns up front,
                     not after filling out the form and hitting Save. */
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", width: "100%" }}>
                    Only the person who added this expense or the group owner can edit it.
                  </Typography>
                )}
              </DialogActions>
            </>
          );
        })()}
    </Dialog>
  );
}
