import { xensplitKeys } from "../../../hooks/xensplit/keys";
import { useUploadProgress } from "../../../hooks/useUploadProgress";
import DetailHeader from "../../../components/ui/DetailHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import { useState, useRef, useMemo, useEffect } from "react";
import { formatCurrency, getGroupCurrencies } from "../../../utils/currencyUtils";
import { useQueryClient } from "@tanstack/react-query";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import ImageLightbox from "../../../components/ui/ImageLightbox";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Button,
  Avatar,
  AvatarGroup,
  Tabs,
  Tab,
  ListItemText,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  Divider,
  CircularProgress,
  Fab,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SettingsIcon from "@mui/icons-material/Settings";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import GridViewIcon from "@mui/icons-material/GridView";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import RepeatIcon from "@mui/icons-material/Repeat";
import { useTitle } from "../../../hooks/useTitle";
import { useXenSplit } from "../../../hooks/xensplit/useGroup";
import { useXenSplits } from "../../../hooks/xensplit/useGroups";
import { useXenSplitBalances } from "../../../hooks/xensplit/useBalances";
import { useXenSplitExpenses, useExpenseImageUrls } from "../../../hooks/xensplit/useExpenses";
import { useXenSplitExchanges } from "../../../hooks/xensplit/useExchanges";
import { useXenSplitSocket } from "../../../hooks/xensplit/useXenSplitSocket";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import UserSelect from "../../../components/UserSelect";
import { SearchedUser } from "../../../hooks/useUserSearch";
import { canSubmit, draftFromExpense, emptyDraft, expenseFormProps, splitsFor, useExpenseDraft } from "./expenseDraft";
import ExpenseForm from "./components/ExpenseForm";
import { recurringSeriesCaption, computeFinalExpenseIds, isSeriesEnded } from "./components/ExpenseListItem";
import GroupAvatar from "./components/GroupAvatar";
import CreateExchangeDialog from "./components/CreateExchangeDialog";
import EtransferPromptDialog, { isEtransferPromptDismissed } from "./components/EtransferPromptDialog";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { apiClient } from "../../../config/api";
import type {
  XenSplit,
  XenSplitBalancesData,
  XenSplitExpense,
  SettleDebtInput,
  CreateExchangeInput,
  UpdateExpenseInput,
} from "../../../hooks/xensplit/types";

export interface GroupDetailContext {
  group: XenSplit;
  balancesData: XenSplitBalancesData | undefined;
  user: { id: string; username: string; email: string; avatar: string };
  isCreator: boolean;
  onAddExpense: () => void;
  onEditExpense: (expense: XenSplitExpense) => void;
  onViewExpense: (expense: XenSplitExpense) => void;
  settleDebt: (input: SettleDebtInput, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
  isSettlingDebt: boolean;
  onAddExchange: () => void;
  addExchange: (
    input: CreateExchangeInput,
    options?: { onSuccess?: () => void; onError?: (error: Error) => void },
  ) => void;
  isAddingExchange: boolean;
  deleteExchange: (exchangeId: string) => void;
  isDeletingExchange: boolean;
  onAddMembers: () => void;
  onMemberMenu: (memberId: string, anchor: HTMLElement) => void;
  updateGroup: (
    updates: { name?: string; default_currency?: string; secondary_currencies?: string[] },
    options?: { onSuccess?: () => void; onError?: (error: Error) => void },
  ) => void;
  isUpdating: boolean;
  uploadGroupImage: (file: File, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
  isUploadingImage: boolean;
  deleteSettlement: (settlementId: string) => void;
  isDeletingSettlement: boolean;
  /**
   * Whether soft-deleted records are revealed in the Expenses list, Settlements history
   * and Overview feed. Set on the Settings tab; a personal display preference, persisted
   * per group, so each member controls their own view. Presentation only - balances never
   * count deleted records either way.
   */
  showDeleted: boolean;
  setShowDeleted: (next: boolean) => void;
  cancelRecurring: (recurringId: string) => void;
  isCancellingRecurring: boolean;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:600px)");
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  // Ask, then run the action only if the person confirms.
  const confirmThen = async (options: Parameters<typeof confirm>[0], action: () => void | Promise<void>) => {
    if (await confirm(options)) await action();
  };
  const queryClient = useQueryClient();
  const {
    group,
    isLoading,
    isError,
    error,
    refetch,
    addMembers,
    isAddingMembers,
    removeMember,
    updateGroup,
    isUpdating,
    uploadGroupImage,
    isUploadingImage,
  } = useXenSplit(groupId!);
  useTitle("Xensplit");
  const { deleteGroup } = useXenSplits();
  const { balancesData, settleDebt, isSettlingDebt, deleteSettlement, isDeletingSettlement } = useXenSplitBalances(
    groupId!,
  );
  const {
    updateExpense,
    isUpdatingExpense,
    addExpense,
    isAddingExpense,
    deleteExpense,
    isDeletingExpense,
    cancelRecurring,
    isCancellingRecurring,
    uploadExpenseImages,
    isUploadingImages,
    deleteExpenseImage,
    isDeletingExpenseImage,
  } = useXenSplitExpenses(groupId!);
  const { addExchange, isAddingExchange, deleteExchange, isDeletingExchange, fetchLiveRate, isFetchingLiveRate } =
    useXenSplitExchanges(groupId!);
  useXenSplitSocket(groupId!);
  const { profile } = useUserProfile();
  const [showEtransferPrompt, setShowEtransferPrompt] = useState(false);
  // Remembers the group we last nudged for: re-nudges once per distinct group opened
  // (GroupDetail stays mounted when navigating group→group), and stops a dismissal from
  // reopening the dialog when the profile query re-resolves.
  const etransferPromptShownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || !groupId) return;
    if (profile.etransfer?.handle || isEtransferPromptDismissed()) return;
    if (etransferPromptShownFor.current === groupId) return;
    etransferPromptShownFor.current = groupId;
    setShowEtransferPrompt(true);
  }, [profile, groupId]);

  const location = useLocation();
  const activeTab = location.pathname.endsWith("/overview")
    ? 0
    : location.pathname.endsWith("/expenses")
      ? 1
      : location.pathname.endsWith("/balances")
        ? 2
        : false;
  const hideAddExpense =
    location.pathname.endsWith("/analytics") ||
    location.pathname.endsWith("/settings") ||
    location.pathname.endsWith("/explain") ||
    location.pathname.endsWith("/settlements") ||
    location.pathname.endsWith("/activity");
  // Routes whose page header stays fixed while only the list underneath scrolls.
  const paneled = ["/overview", "/expenses", "/balances", "/settings", "/explain", "/activity"].some((p) =>
    location.pathname.endsWith(p),
  );
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SearchedUser[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  // Reveals soft-deleted records across the Expenses, Settlements and Overview tabs.
  // Owned here rather than in each tab so toggling it on the Settings tab takes effect
  // immediately, instead of waiting for a sibling route to remount.
  const showDeletedKey = `xensplit_showDeleted_${groupId}`;
  const [showDeleted, setShowDeleted] = useState(() => localStorage.getItem(showDeletedKey) === "true");
  const handleShowDeletedChange = (next: boolean) => {
    setShowDeleted(next);
    localStorage.setItem(showDeletedKey, String(next));
  };

  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<XenSplitExpense | null>(null);
  const add = useExpenseDraft();

  const edit = useExpenseDraft();

  const [showViewExpenseModal, setShowViewExpenseModal] = useState(false);
  const [viewExpenseItem, setViewExpenseItem] = useState<XenSplitExpense | null>(null);
  const [showAddExchangeModal, setShowAddExchangeModal] = useState(false);
  const { percent: uploadPercent, onUploadProgress, reset: resetUploadProgress } = useUploadProgress();

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: viewImageUrls = [] } = useExpenseImageUrls(
    groupId ?? "",
    viewExpenseItem?._id,
    viewExpenseItem?.images?.length ?? 0,
  );
  const { data: editImageUrls = [] } = useExpenseImageUrls(
    groupId ?? "",
    selectedExpense?._id,
    selectedExpense?.images?.length ?? 0,
  );

  const finalExpenseIds = useMemo(
    () => computeFinalExpenseIds(group?.expenses ?? [], group?.recurring_expenses),
    [group?.expenses, group?.recurring_expenses],
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorDisplay error={error} onRetry={() => refetch()} />;
  if (!group) return null;

  const isCreator = group.created_by === user?.id;

  const findSeriesForGenesis = (expenseId: string) =>
    group.recurring_expenses?.find((r) => r.genesis_expense_id === expenseId);
  const selectedExpenseSeries = selectedExpense ? findSeriesForGenesis(selectedExpense._id) : undefined;
  // Same rule the server enforces on PUT/DELETE: the expense's creator or the group owner
  const canEditExpense = (expense: XenSplitExpense) =>
    isCreator || !expense.created_by || expense.created_by === user?.id;

  const handleAddMembers = async () => {
    if (selectedMembers.length === 0) return;
    await new Promise<void>((resolve) => {
      addMembers(
        selectedMembers.map((m) => m._id),
        {
          onSuccess: () => {
            enqueueSnackbar("Members added", { variant: "success" });
            setShowAddMemberModal(false);
            setSelectedMembers([]);
            resolve();
          },
          onError: (error: Error) => {
            enqueueSnackbar(error?.message || "Failed to add members", { variant: "error" });
            resolve();
          },
        },
      );
    });
  };

  const handleRemoveMember = async (memberId: string) => {
    await new Promise<void>((resolve) => {
      removeMember(memberId, {
        onSuccess: () => {
          enqueueSnackbar("Member removed", { variant: "success" });
          resolve();
        },
        onError: (error: Error) => {
          enqueueSnackbar(error?.message || "Failed to remove member", { variant: "error" });
          resolve();
        },
      });
    });
    setMenuAnchor(null);
    setMenuMemberId(null);
  };

  const handleCloseGroup = async () => {
    await new Promise<void>((resolve) => {
      deleteGroup(groupId!, {
        onSuccess: () => {
          enqueueSnackbar("Group closed", { variant: "success" });
          resolve();
        },
        onError: (error: Error) => {
          enqueueSnackbar(error?.message || "Failed to close group", { variant: "error" });
          resolve();
        },
      });
    });
    navigate("/internal/xensplit/groups");
    setMenuAnchor(null);
    setMenuMemberId(null);
  };

  const handleTransferOwnership = async () => {
    if (!menuMemberId) return;
    try {
      await apiClient.post(`/api/xensplit/groups/${groupId}/transfer`, { newOwnerId: menuMemberId });
      enqueueSnackbar("Ownership transferred", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: xensplitKeys.groups() });
    } catch {
      enqueueSnackbar("Failed to transfer ownership", { variant: "error" });
    } finally {
      setMenuAnchor(null);
      setMenuMemberId(null);
    }
  };

  const handleAddExpense = async () => {
    if (!add.values.title.trim() || !add.values.amount || !add.values.paidBy) return;

    const numAmount = parseFloat(add.values.amount);
    const splits = splitsFor(add.values);

    await new Promise<void>((resolve) => {
      addExpense(
        {
          paid_by: add.values.paidBy,
          amount: numAmount,
          currency: add.values.currency,
          title: add.values.title,
          notes: add.values.notes.trim() || undefined,
          category: add.values.category || undefined,
          date: add.values.date.toISOString(),
          split_type: add.values.splitType,
          splits,
          on_hold: add.values.onHold,
          recurring: add.values.isRecurring
            ? {
                frequency: add.values.frequency,
                end_date: add.values.recurringEndDate ? add.values.recurringEndDate.toISOString() : undefined,
                max_occurrences: add.values.maxOccurrences ? parseInt(add.values.maxOccurrences, 10) : undefined,
              }
            : undefined,
        },
        {
          onSuccess: async (result) => {
            const newExpenseId = result?.data?.newExpenseId;
            if (add.values.images.length > 0 && newExpenseId) {
              try {
                await uploadExpenseImages({ expenseId: newExpenseId, files: add.values.images, onUploadProgress });
              } catch (error) {
                // Say why, and keep it in the console: a bare "failed to upload" hid the cause of
                // this for a long time. The expense itself was saved; only the photos are missing.
                console.error("Photo upload after adding an expense failed:", error);
                enqueueSnackbar(
                  `Expense added, but the photos didn't upload (${(error as Error)?.message || "unknown error"}). Open the expense to add them again.`,
                  { variant: "warning" },
                );
              } finally {
                resetUploadProgress();
              }
            }
            enqueueSnackbar(add.values.isRecurring && !newExpenseId ? "Recurring expense scheduled" : "Expense added", {
              variant: "success",
            });
            setShowAddExpenseModal(false);
            add.reset(emptyDraft({ currency: group.default_currency || "CAD" }));
            resolve();
          },
          onError: (error: Error) => {
            enqueueSnackbar(error?.message || "Failed to add expense", { variant: "error" });
            resolve();
          },
        },
      );
    });
  };

  const handleEditExpense = async () => {
    if (!selectedExpense || !edit.values.title.trim() || !edit.values.amount || !edit.values.paidBy) return;

    const numAmount = parseFloat(edit.values.amount);
    const splits = splitsFor(edit.values);

    let recurring: UpdateExpenseInput["recurring"] = undefined;
    if (selectedExpenseSeries) {
      recurring = edit.values.isRecurring
        ? {
            end_date: edit.values.recurringEndDate ? edit.values.recurringEndDate.toISOString() : null,
            max_occurrences: edit.values.maxOccurrences ? parseInt(edit.values.maxOccurrences, 10) : null,
            active: edit.values.seriesActive,
          }
        : { cancel: true };
    }

    await new Promise<void>((resolve) => {
      updateExpense(
        {
          expenseId: selectedExpense._id,
          updates: {
            paid_by: edit.values.paidBy,
            amount: numAmount,
            currency: edit.values.currency,
            title: edit.values.title,
            notes: edit.values.notes.trim() || undefined,
            category: edit.values.category || undefined,
            date: edit.values.date.toISOString(),
            split_type: edit.values.splitType,
            splits,
            on_hold: edit.values.onHold,
            recurring,
          },
        },
        {
          onSuccess: async () => {
            if (edit.values.images.length > 0) {
              try {
                await uploadExpenseImages({
                  expenseId: selectedExpense._id,
                  files: edit.values.images,
                  onUploadProgress,
                });
              } catch (error) {
                console.error("Photo upload after editing an expense failed:", error);
                enqueueSnackbar(
                  `Expense updated, but the photos didn't upload (${(error as Error)?.message || "unknown error"}).`,
                  { variant: "warning" },
                );
              } finally {
                resetUploadProgress();
              }
            }
            enqueueSnackbar("Expense updated", { variant: "success" });
            setShowEditExpenseModal(false);
            edit.setters.images([]);
            resolve();
          },
          onError: (error: Error) => {
            enqueueSnackbar(error?.message || "Failed to update expense", { variant: "error" });
            resolve();
          },
        },
      );
    });
  };

  const handleOpenEditExpense = (expense: XenSplitExpense) => {
    if (!canEditExpense(expense)) {
      enqueueSnackbar("Only the person who added this expense or the group owner can edit it", { variant: "info" });
      return;
    }
    setSelectedExpense(expense);
    edit.reset(draftFromExpense(expense, group.members, findSeriesForGenesis(expense._id)));
    setShowEditExpenseModal(true);
  };

  const openAddExpenseModal = () => {
    add.reset(
      emptyDraft({
        currency: group.default_currency || "CAD",
        paidBy: user?.id || "",
        paidByUser: user ? { _id: user.id, username: user.username, avatar: user.avatar } : null,
      }),
    );
    setShowAddExpenseModal(true);
  };

  const outletContext: GroupDetailContext = {
    group,
    balancesData,
    user,
    isCreator,
    onAddExpense: openAddExpenseModal,
    onEditExpense: handleOpenEditExpense,
    onViewExpense: (expense) => {
      setViewExpenseItem(expense);
      setShowViewExpenseModal(true);
    },
    settleDebt,
    isSettlingDebt,
    onAddExchange: () => setShowAddExchangeModal(true),
    addExchange,
    isAddingExchange,
    deleteExchange,
    isDeletingExchange,
    onAddMembers: () => setShowAddMemberModal(true),
    onMemberMenu: (memberId, anchor) => {
      setMenuAnchor(anchor);
      setMenuMemberId(memberId);
    },
    updateGroup,
    isUpdating,
    uploadGroupImage,
    isUploadingImage,
    deleteSettlement,
    showDeleted,
    setShowDeleted: handleShowDeletedChange,
    isDeletingSettlement,
    cancelRecurring,
    isCancellingRecurring,
  };

  return (
    <Box>
      <Container
        maxWidth="lg"
        sx={
          paneled
            ? {
                px: { xs: 2, sm: 3 },
                pt: { xs: 1, sm: 2 },
                height: { xs: "calc(100dvh - 56px)", sm: "calc(100dvh - 64px)" },
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }
            : { mt: { xs: 1, sm: 4 }, mb: 4, px: { xs: 2, sm: 3 }, pb: { xs: hideAddExpense ? 0 : 12, md: 0 } }
        }
      >
        {/* Header */}
        <DetailHeader
          title={group.name}
          backLabel={activeTab === false ? "Back to group" : "All groups"}
          onBack={() =>
            navigate(
              activeTab === false ? `/internal/xensplit/groups/${groupId}/overview` : "/internal/xensplit/groups",
            )
          }
          leading={
            <GroupAvatar
              name={group.name}
              imageUrl={group.image_url}
              size={{ xs: 36, sm: 44 }}
              borderRadius={1.5}
              fontSize={{ xs: "0.9rem", sm: "1.1rem" }}
            />
          }
          subtitle={
            <Box sx={{ display: "flex", alignItems: "center", mt: 0.25 }}>
              <AvatarGroup
                max={4}
                sx={{
                  "& .MuiAvatar-root": {
                    width: 20,
                    height: 20,
                    fontSize: 9,
                    border: "1.5px solid",
                    borderColor: "background.paper",
                  },
                }}
              >
                {group.members.map((m) => (
                  <Avatar key={m.user_id} src={m.avatar || undefined}>
                    {m.username[0]?.toUpperCase()}
                  </Avatar>
                ))}
              </AvatarGroup>
            </Box>
          }
          actions={
            <>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={openAddExpenseModal}
                sx={{ display: activeTab === false ? "none" : { xs: "none", md: "inline-flex" }, flexShrink: 0 }}
              >
                New Expense
              </Button>
              <IconButton
                onClick={() => navigate(`/internal/xensplit/groups/${groupId}/analytics`)}
                size="small"
                aria-label="Analytics"
                sx={{ flexShrink: 0, display: activeTab === false ? "none" : "inline-flex" }}
              >
                <AnalyticsIcon />
              </IconButton>
              <IconButton
                onClick={() => navigate(`/internal/xensplit/groups/${groupId}/settings`)}
                size="small"
                aria-label="Settings"
                sx={{ flexShrink: 0, display: activeTab === false ? "none" : "inline-flex" }}
              >
                <SettingsIcon />
              </IconButton>
            </>
          }
        />

        {/* Tabs */}
        {activeTab !== false && (
          <Box sx={{ bgcolor: "action.hover", borderRadius: "8px 8px 0 0", mb: 3, flexShrink: 0 }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) =>
                navigate(`/internal/xensplit/groups/${groupId}/${["overview", "expenses", "balances"][v]}`)
              }
              variant="fullWidth"
            >
              <Tab
                icon={<GridViewIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
                iconPosition="top"
                label="Overview"
                sx={{
                  minHeight: { xs: 56, sm: 64 },
                  fontSize: { xs: "0.65rem", sm: "0.875rem" },
                  py: { xs: 0.5, sm: 1 },
                }}
              />
              <Tab
                icon={<ReceiptLongIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
                iconPosition="top"
                label="Expenses"
                sx={{
                  minHeight: { xs: 56, sm: 64 },
                  fontSize: { xs: "0.65rem", sm: "0.875rem" },
                  py: { xs: 0.5, sm: 1 },
                }}
              />
              <Tab
                icon={<AccountBalanceWalletIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
                iconPosition="top"
                label="Balances"
                sx={{
                  minHeight: { xs: 56, sm: 64 },
                  fontSize: { xs: "0.65rem", sm: "0.875rem" },
                  py: { xs: 0.5, sm: 1 },
                }}
              />
            </Tabs>
          </Box>
        )}

        <Outlet context={outletContext} />
        <Fab
          color="primary"
          aria-label="Add expense"
          onClick={openAddExpenseModal}
          sx={{
            display: hideAddExpense ? "none" : { xs: "flex", md: "none" },
            position: "fixed",
            bottom: 24,
            right: 24,
          }}
        >
          <AddIcon />
        </Fab>
      </Container>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {menuMemberId && menuMemberId === user?.id && isCreator ? (
          <>
            <MenuItem onClick={handleTransferOwnership} sx={{ color: "primary.main" }}>
              <GroupRemoveIcon sx={{ mr: 1 }} fontSize="small" />
              <ListItemText>Transfer Ownership</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                void confirmThen(
                  { title: "Leave this group?", message: "You will no longer be a member.", confirmLabel: "Leave" },
                  () => handleRemoveMember(menuMemberId),
                );
              }}
              sx={{ color: "error.main" }}
            >
              <GroupRemoveIcon sx={{ mr: 1 }} fontSize="small" />
              <ListItemText>Leave Group</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                void confirmThen(
                  {
                    title: "Close this group?",
                    message: "All expenses and data will be permanently deleted.",
                    confirmLabel: "Close group",
                  },
                  handleCloseGroup,
                );
              }}
              sx={{ color: "error.main" }}
            >
              <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
              <ListItemText>Close Group</ListItemText>
            </MenuItem>
          </>
        ) : menuMemberId && menuMemberId === user?.id ? (
          <MenuItem
            onClick={() => {
              void confirmThen(
                { title: "Leave this group?", message: "You will no longer be a member.", confirmLabel: "Leave" },
                () => handleRemoveMember(menuMemberId),
              );
            }}
            sx={{ color: "error.main" }}
          >
            <GroupRemoveIcon sx={{ mr: 1 }} fontSize="small" />
            <ListItemText>Leave Group</ListItemText>
          </MenuItem>
        ) : menuMemberId && isCreator && menuMemberId !== group.created_by ? (
          <MenuItem
            onClick={() => {
              const memberName = group.members.find((m) => m.user_id === menuMemberId)?.username || "this member";
              void confirmThen(
                {
                  title: `Remove ${memberName}?`,
                  message: "They will no longer be in this group.",
                  confirmLabel: "Remove",
                },
                () => handleRemoveMember(menuMemberId),
              );
            }}
            sx={{ color: "error.main" }}
          >
            <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
            <ListItemText>Remove from Group</ListItemText>
          </MenuItem>
        ) : null}
      </Menu>

      <Dialog fullWidth maxWidth="xs" open={showAddMemberModal} onClose={() => setShowAddMemberModal(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Members</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <UserSelect
            value={selectedMembers}
            onChange={setSelectedMembers}
            label="Search Users"
            placeholder="Search for users..."
            excludeUserIds={group.members.map((m) => m.user_id)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button fullWidth variant="outlined" onClick={() => setShowAddMemberModal(false)}>
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={handleAddMembers}
            disabled={selectedMembers.length === 0 || isAddingMembers}
            loading={isAddingMembers}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        open={showAddExpenseModal}
        onClose={(_, reason) => {
          if (reason !== "backdropClick") {
            setShowAddExpenseModal(false);
            add.setters.images([]);
          }
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 3, pt: 2 }}>
          <DialogTitle sx={{ fontWeight: 700, p: 0 }}>New Expense</DialogTitle>
          <IconButton onClick={() => setShowAddExpenseModal(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ pt: 2 }}>
          <ExpenseForm
            {...expenseFormProps(add)}
            members={group.members}
            currencyOptions={getGroupCurrencies(
              group.default_currency,
              group.secondary_currencies,
              add.values.currency,
            )}
            onSubmit={handleAddExpense}
            submitDisabled={!canSubmit(add.values)}
            loading={isAddingExpense || isUploadingImages}
            uploadPercent={uploadPercent}
            holdMode="free"
            recurringMode="create"
          />
        </DialogContent>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        open={showEditExpenseModal}
        onClose={() => {
          setShowEditExpenseModal(false);
          edit.setters.images([]);
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 3, pt: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <DialogTitle sx={{ fontWeight: 700, p: 0 }}>Edit Expense</DialogTitle>
            <IconButton
              aria-label="Delete expense"
              color="error"
              size="small"
              onClick={async () => {
                if (!selectedExpense) return;
                const ok = await confirm({
                  title: "Delete this expense?",
                  message: selectedExpenseSeries
                    ? "This cannot be undone. It also stops its recurring schedule; already-created expenses are kept. The expense stays in the group's history and can be shown from Settings."
                    : "This cannot be undone. The expense stays in the group's history and can be shown from Settings, but it can never be brought back.",
                });
                if (ok) {
                  await new Promise<void>((resolve) => {
                    deleteExpense(selectedExpense._id, {
                      onSuccess: () => {
                        enqueueSnackbar("Expense deleted", { variant: "success" });
                        setShowEditExpenseModal(false);
                        setSelectedExpense(null);
                        resolve();
                      },
                      onError: (error: Error) => {
                        enqueueSnackbar(error?.message || "Failed to delete expense", { variant: "error" });
                        resolve();
                      },
                    });
                  });
                }
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
          <IconButton onClick={() => setShowEditExpenseModal(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ pt: 2 }}>
          <ExpenseForm
            {...expenseFormProps(edit)}
            members={group.members}
            currencyOptions={getGroupCurrencies(
              group.default_currency,
              group.secondary_currencies,
              edit.values.currency,
            )}
            onSubmit={handleEditExpense}
            submitDisabled={!canSubmit(edit.values)}
            submitLabel="Save Changes"
            loading={isUpdatingExpense || isUploadingImages}
            uploadPercent={uploadPercent}
            existingImages={selectedExpense?.images}
            existingImageUrls={editImageUrls}
            onDeleteExistingImage={(imageId) => deleteExpenseImage({ expenseId: selectedExpense!._id, imageId })}
            isDeletingImage={isDeletingExpenseImage}
            isEditing
            holdMode={
              group.created_by === user.id ? "free" : selectedExpense?.created_by === user.id ? "oneWay" : "hidden"
            }
            recurringMode={selectedExpenseSeries ? "editSeries" : "off"}
            seriesEnded={selectedExpenseSeries ? isSeriesEnded(selectedExpenseSeries) : false}
            seriesWasInactive={selectedExpenseSeries ? !selectedExpenseSeries.active : false}
          />
        </DialogContent>
      </Dialog>

      {/* View Expense Modal (read-only) */}
      <Dialog fullWidth maxWidth="xs" open={showViewExpenseModal} onClose={() => setShowViewExpenseModal(false)}>
        {viewExpenseItem &&
          (() => {
            const e = viewExpenseItem;
            const payer = group.members.find((m) => m.user_id === e.paid_by);
            const splitTypeLabel =
              e.split_type === "equal" ? "Equal split" : e.split_type === "exact" ? "Exact amounts" : "By percentage";
            return (
              <>
                <Box sx={{ position: "relative", pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                  <IconButton
                    onClick={() => setShowViewExpenseModal(false)}
                    size="small"
                    sx={{ position: "absolute", top: 12, right: 12 }}
                  >
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
                    <Avatar src={payer?.avatar || undefined} sx={{ width: 32, height: 32, flexShrink: 0 }}>
                      {payer?.username?.[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
                        Paid by
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {payer?.username ?? "Unknown"}
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
                              <Avatar src={member?.avatar || undefined} sx={{ width: 28, height: 28, fontSize: 11 }}>
                                {member?.username?.[0]?.toUpperCase()}
                              </Avatar>
                              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                                {member?.username ?? "?"}
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
                          const urlEntry = viewImageUrls.find((u) => u._id === img._id);
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
                              onClick={() => urlEntry && setLightboxUrl(urlEntry.signedUrl)}
                            >
                              {urlEntry ? (
                                <Box
                                  component="img"
                                  src={urlEntry.signedUrl}
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

                <DialogActions sx={{ px: 3, pb: 2.5 }}>
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
                              onClick={() => setViewExpenseItem(genesisExpense)}
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
                                      setShowViewExpenseModal(false);
                                      setViewExpenseItem(null);
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
                        setShowViewExpenseModal(false);
                        handleOpenEditExpense(e);
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

      <CreateExchangeDialog
        open={showAddExchangeModal}
        onClose={() => setShowAddExchangeModal(false)}
        members={group.members}
        currentUser={{ id: user.id, username: user.username, avatar: user.avatar }}
        defaultCurrency={group.default_currency}
        secondaryCurrencies={group.secondary_currencies}
        groupId={groupId!}
        addExchange={addExchange}
        isAddingExchange={isAddingExchange}
        fetchLiveRate={fetchLiveRate}
        isFetchingLiveRate={isFetchingLiveRate}
      />

      <EtransferPromptDialog open={showEtransferPrompt} onClose={() => setShowEtransferPrompt(false)} />

      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </Box>
  );
}
