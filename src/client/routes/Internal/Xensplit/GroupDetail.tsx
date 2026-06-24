import { useState } from "react";
import { formatCurrency } from "../../../utils/currencyUtils";
import { useQueryClient } from "@tanstack/react-query";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useSnackbar } from "notistack";
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
  List,
  ListItem,
  ListItemAvatar,
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
  TextField,
  Fab,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EastIcon from "@mui/icons-material/East";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteIcon from "@mui/icons-material/Delete";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SettingsIcon from "@mui/icons-material/Settings";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import GridViewIcon from "@mui/icons-material/GridView";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useTitle } from "../../../hooks/useTitle";
import { useXenSplit } from "../../../hooks/xensplit/useGroup";
import { useXenSplits } from "../../../hooks/xensplit/useGroups";
import { useXenSplitBalances } from "../../../hooks/xensplit/useBalances";
import { useXenSplitExpenses, useExpenseImageUrls } from "../../../hooks/xensplit/useExpenses";
import { useXenSplitSocket } from "../../../hooks/xensplit/useXenSplitSocket";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import UserSelect from "../../../components/UserSelect";
import { SearchedUser } from "../../../hooks/useUserSearch";
import ExpenseForm from "./components/ExpenseForm";
import GroupAvatar from "./components/GroupAvatar";
import { apiClient } from "../../../config/api";
import type { XenSplit, XenSplitBalancesData, XenSplitExpense, XenSplitSettlementTransfer } from "../../../hooks/xensplit/types";

export interface GroupDetailContext {
  group: XenSplit;
  balancesData: XenSplitBalancesData | undefined;
  user: { id: string; username: string; email: string; avatar: string };
  isCreator: boolean;
  onAddExpense: () => void;
  onEditExpense: (expense: XenSplitExpense) => void;
  onViewExpense: (expense: XenSplitExpense) => void;
  onSettle: (settlement: XenSplitSettlementTransfer) => void;
  onAddMembers: () => void;
  onMemberMenu: (memberId: string, anchor: HTMLElement) => void;
  updateGroup: (updates: { name?: string; default_currency?: string }, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
  isUpdating: boolean;
  uploadGroupImage: (file: File, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
  isUploadingImage: boolean;
  deleteSettlement: (settlementId: string) => void;
  isDeletingSettlement: boolean;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:600px)");
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { group, isLoading, isError, error, addMembers, isAddingMembers, removeMember, isRemovingMember, updateGroup, isUpdating, uploadGroupImage, isUploadingImage } = useXenSplit(groupId!);
  useTitle("Xensplit");
  const { deleteGroup } = useXenSplits();
  const { balancesData, settleDebt, isSettlingDebt, deleteSettlement, isDeletingSettlement } = useXenSplitBalances(groupId!);
  const { updateExpense, updateExpenseAsync, isUpdatingExpense, addExpense, addExpenseAsync, isAddingExpense, deleteExpense, isDeletingExpense, uploadExpenseImages, isUploadingImages, deleteExpenseImage, isDeletingExpenseImage } = useXenSplitExpenses(groupId!);
  useXenSplitSocket(groupId!);
  const location = useLocation();
  const activeTab = location.pathname.endsWith("/overview")
    ? 0
    : location.pathname.endsWith("/expenses")
      ? 1
      : location.pathname.endsWith("/balances")
        ? 2
        : false;
  const hideAddExpense = location.pathname.endsWith("/analytics") || location.pathname.endsWith("/settings");
  // Routes whose page header stays fixed while only the list underneath scrolls.
  const paneled = ["/overview", "/expenses", "/balances", "/settings"].some((p) => location.pathname.endsWith(p));
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SearchedUser[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<XenSplitExpense | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addCurrency, setAddCurrency] = useState("CAD");
  const [addPaidBy, setAddPaidBy] = useState("");
  const [addPaidByUser, setAddPaidByUser] = useState<SearchedUser | null>(null);
  const [addSplitType, setAddSplitType] = useState<"equal" | "exact" | "percent">("equal");
  const [addSelectedParticipants, setAddSelectedParticipants] = useState<SearchedUser[]>([]);
  const [addExactSplits, setAddExactSplits] = useState<{ [userId: string]: string }>({});
  const [addPercentSplits, setAddPercentSplits] = useState<{ [userId: string]: string }>({});
  const [addDate, setAddDate] = useState<Date>(new Date());
  const [addCategory, setAddCategory] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("CAD");
  const [editPaidBy, setEditPaidBy] = useState("");
  const [editPaidByUser, setEditPaidByUser] = useState<SearchedUser | null>(null);
  const [editSplitType, setEditSplitType] = useState<"equal" | "exact" | "percent">("equal");
  const [editSelectedParticipants, setEditSelectedParticipants] = useState<SearchedUser[]>([]);
  const [editExactSplits, setEditExactSplits] = useState<{ [userId: string]: string }>({});
  const [editPercentSplits, setEditPercentSplits] = useState<{ [userId: string]: string }>({});
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editCategory, setEditCategory] = useState("");
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<XenSplitSettlementTransfer | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [showViewExpenseModal, setShowViewExpenseModal] = useState(false);
  const [viewExpenseItem, setViewExpenseItem] = useState<XenSplitExpense | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogText, setConfirmDialogText] = useState("");
  const [confirmAction, setConfirmAction] = useState<() => void>(() => { });
  const [addImages, setAddImages] = useState<File[]>([]);
  const [editImages, setEditImages] = useState<File[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: viewImageUrls = [] } = useExpenseImageUrls(
    groupId ?? "",
    viewExpenseItem?._id,
    viewExpenseItem?.images?.length ?? 0
  );
  const { data: editImageUrls = [] } = useExpenseImageUrls(
    groupId ?? "",
    selectedExpense?._id,
    selectedExpense?.images?.length ?? 0
  );

  const handleConfirm = () => {
    confirmAction();
    setShowConfirmDialog(false);
  };

  // Check if exact splits total matches amount
  const isExactValid = addSplitType !== "exact" || addSelectedParticipants.length === 0 ||
    Math.abs(Object.values(addExactSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) - (parseFloat(addAmount) || 0)) < 0.01;

  // Check if percent splits total equals 100
  const isPercentValid = addSplitType !== "percent" || addSelectedParticipants.length === 0 ||
    Math.abs(Object.values(addPercentSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) - 100) < 0.01;

  // Same for edit
  const isEditExactValid = editSplitType !== "exact" || editSelectedParticipants.length === 0 ||
    Math.abs(Object.values(editExactSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) - (parseFloat(editAmount) || 0)) < 0.01;
  const isEditPercentValid = editSplitType !== "percent" || editSelectedParticipants.length === 0 ||
    Math.abs(Object.values(editPercentSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) - 100) < 0.01;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorDisplay error={error} />;
  if (!group) return null;

  const isCreator = group.created_by === user?.id;

  const handleAddMembers = async () => {
    if (selectedMembers.length === 0) return;
    await new Promise<void>((resolve) => {
      addMembers(selectedMembers.map((m) => m._id), {
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
      });
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
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "groups"] });
    } catch {
      enqueueSnackbar("Failed to transfer ownership", { variant: "error" });
    } finally {
      setMenuAnchor(null);
      setMenuMemberId(null);
    }
  };

  const handleAddExpense = async () => {
    if (!addTitle.trim() || !addAmount || !addPaidBy) return;

    const numAmount = parseFloat(addAmount);
    let splits = undefined;

    if (addSplitType === "equal") {
      splits = addSelectedParticipants.map((p) => ({
        user_id: p._id,
      }));
    } else if (addSplitType === "exact") {
      splits = addSelectedParticipants.map((p) => ({
        user_id: p._id,
        amount_owed: parseFloat(addExactSplits[p._id] || "0"),
      }));
    } else if (addSplitType === "percent") {
      splits = addSelectedParticipants.map((p) => ({
        user_id: p._id,
        percentage: parseFloat(addPercentSplits[p._id] || "0"),
      }));
    }

    await new Promise<void>((resolve) => {
      addExpense(
        {
          paid_by: addPaidBy,
          amount: numAmount,
          currency: addCurrency,
          title: addTitle,
          notes: addNotes.trim() || undefined,
          category: addCategory || undefined,
          date: addDate.toISOString(),
          split_type: addSplitType,
          splits,
        },
        {
          onSuccess: async (result) => {
            const newExpenseId = result?.data?.newExpenseId;
            if (addImages.length > 0 && newExpenseId) {
              try {
                await uploadExpenseImages({ expenseId: newExpenseId, files: addImages });
              } catch {
                enqueueSnackbar("Expense added but some images failed to upload", { variant: "warning" });
              }
            }
            enqueueSnackbar("Expense added", { variant: "success" });
            setShowAddExpenseModal(false);
            setAddTitle("");
            setAddNotes("");
            setAddAmount("");
            setAddCurrency(group.default_currency || "CAD");
            setAddPaidBy("");
            setAddPaidByUser(null);
            setAddSplitType("equal");
            setAddSelectedParticipants([]);
            setAddExactSplits({});
            setAddPercentSplits({});
            setAddCategory("");
            setAddImages([]);
            resolve();
          },
          onError: (error: Error) => {
            enqueueSnackbar(error?.message || "Failed to add expense", { variant: "error" });
            resolve();
          },
        }
      );
    });
  };

  const handleEditExpense = async () => {
    if (!selectedExpense || !editTitle.trim() || !editAmount || !editPaidBy) return;

    const numAmount = parseFloat(editAmount);
    let splits = undefined;

    if (editSplitType === "equal") {
      splits = editSelectedParticipants.map((p) => ({
        user_id: p._id,
      }));
    } else if (editSplitType === "exact") {
      splits = editSelectedParticipants.map((p) => ({
        user_id: p._id,
        amount_owed: parseFloat(editExactSplits[p._id] || "0"),
      }));
    } else if (editSplitType === "percent") {
      splits = editSelectedParticipants.map((p) => ({
        user_id: p._id,
        percentage: parseFloat(editPercentSplits[p._id] || "0"),
      }));
    }

    await new Promise<void>((resolve) => {
      updateExpense(
        {
          expenseId: selectedExpense._id, updates: {
            paid_by: editPaidBy,
            amount: numAmount,
            currency: editCurrency,
            title: editTitle,
            notes: editNotes.trim() || undefined,
            category: editCategory || undefined,
            date: editDate.toISOString(),
            split_type: editSplitType,
            splits,
          }
        },
        {
          onSuccess: async () => {
            if (editImages.length > 0) {
              try {
                await uploadExpenseImages({ expenseId: selectedExpense._id, files: editImages });
              } catch {
                enqueueSnackbar("Expense updated but some images failed to upload", { variant: "warning" });
              }
            }
            enqueueSnackbar("Expense updated", { variant: "success" });
            setShowEditExpenseModal(false);
            setEditImages([]);
            resolve();
          },
          onError: (error: Error) => {
            enqueueSnackbar(error?.message || "Failed to update expense", { variant: "error" });
            resolve();
          },
        }
      );
    });
  };

  const handleOpenEditExpense = (expense: XenSplitExpense) => {
    setSelectedExpense(expense);
    setEditTitle(expense.title || "");
    setEditNotes(expense.notes || "");
    setEditAmount(expense.amount.toString());
    setEditCurrency(expense.currency);
    setEditPaidBy(expense.paid_by);
    const payerMember = group.members.find((m) => m.user_id === expense.paid_by);
    setEditPaidByUser(payerMember ? { _id: payerMember.user_id, username: payerMember.username, avatar: payerMember.avatar } : null);
    setEditSplitType(expense.split_type as "equal" | "exact" | "percent");
    if (expense.splits && expense.splits.length > 0) {
      const participants = expense.splits
        .map((s) => {
          const member = group.members.find((m) => m.user_id === s.user_id);
          return member ? { _id: member.user_id, username: member.username, avatar: member.avatar } : null;
        })
        .filter(Boolean) as SearchedUser[];
      setEditSelectedParticipants(participants);
      const exactMap: { [key: string]: string } = {};
      const percentMap: { [key: string]: string } = {};
      expense.splits.forEach((s) => {
        if (expense.split_type === "exact" && s.amount_owed !== undefined) {
          exactMap[s.user_id] = s.amount_owed.toString();
        } else if (expense.split_type === "percent" && s.percentage !== undefined) {
          percentMap[s.user_id] = s.percentage.toString();
        }
      });
      setEditExactSplits(exactMap);
      setEditPercentSplits(percentMap);
    }
    setEditDate(expense.date ? new Date(expense.date) : new Date());
    setEditCategory(expense.category || "");
    setShowEditExpenseModal(true);
  };

  const openAddExpenseModal = () => {
    setAddTitle("");
    setAddNotes("");
    setAddAmount("");
    setAddCurrency(group.default_currency || "CAD");
    setAddPaidBy(user?.id || "");
    setAddPaidByUser(user ? { _id: user.id, username: user.username, avatar: user.avatar } : null);
    setAddSplitType("equal");
    setAddSelectedParticipants([]);
    setAddExactSplits({});
    setAddPercentSplits({});
    setAddCategory("");
    setAddImages([]);
    setAddDate(new Date());
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
    onSettle: (settlement) => {
      setSelectedSettlement(settlement);
      setSettleAmount(settlement.amount.toString());
      setShowSettleModal(true);
    },
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
    isDeletingSettlement,
  };

  return (
    <Box>
      <Container
        maxWidth="md"
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
            : { mt: { xs: 1, sm: 4 }, mb: 4, px: { xs: 2, sm: 3 }, pb: { xs: 12, md: 0 } }
        }
      >
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1 }, mb: { xs: 2, sm: 3 }, flexShrink: 0 }}>
          <IconButton
            onClick={() => navigate(activeTab === false ? `/internal/xensplit/groups/${groupId}/overview` : "/internal/xensplit/groups")}
            size="small"
          >
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexGrow: 1, minWidth: 0 }}>
            <GroupAvatar
              name={group.name}
              imageUrl={group.image_url}
              size={{ xs: 36, sm: 44 }}
              borderRadius={1.5}
              fontSize={{ xs: "0.9rem", sm: "1.1rem" }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                {group.name}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", mt: 0.25 }}>
                <AvatarGroup
                  max={4}
                  sx={{ "& .MuiAvatar-root": { width: 20, height: 20, fontSize: 9, border: "1.5px solid", borderColor: "background.paper" } }}
                >
                  {group.members.map((m) => (
                    <Avatar key={m.user_id} src={m.avatar || undefined}>
                      {m.username[0]?.toUpperCase()}
                    </Avatar>
                  ))}
                </AvatarGroup>
              </Box>
            </Box>
          </Box>
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
            sx={{ flexShrink: 0, display: activeTab === false ? "none" : "inline-flex" }}
          >
            <AnalyticsIcon />
          </IconButton>
          <IconButton
            onClick={() => navigate(`/internal/xensplit/groups/${groupId}/settings`)}
            size="small"
            sx={{ flexShrink: 0, display: activeTab === false ? "none" : "inline-flex" }}
          >
            <SettingsIcon />
          </IconButton>
        </Box>

        {/* Tabs */}
        {activeTab !== false && (
          <Box sx={{ bgcolor: "action.hover", borderRadius: "8px 8px 0 0", mb: 3, flexShrink: 0 }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => navigate(`/internal/xensplit/groups/${groupId}/${["overview", "expenses", "balances"][v]}`)}
              variant="fullWidth"
            >
              <Tab icon={<GridViewIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />} iconPosition="top" label="Overview" sx={{ minHeight: { xs: 56, sm: 64 }, fontSize: { xs: "0.65rem", sm: "0.875rem" }, py: { xs: 0.5, sm: 1 } }} />
              <Tab icon={<ReceiptLongIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />} iconPosition="top" label="Expenses" sx={{ minHeight: { xs: 56, sm: 64 }, fontSize: { xs: "0.65rem", sm: "0.875rem" }, py: { xs: 0.5, sm: 1 } }} />
              <Tab icon={<AccountBalanceWalletIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />} iconPosition="top" label="Balances" sx={{ minHeight: { xs: 56, sm: 64 }, fontSize: { xs: "0.65rem", sm: "0.875rem" }, py: { xs: 0.5, sm: 1 } }} />
            </Tabs>
          </Box>
        )}

        <Outlet context={outletContext} />
        <Fab
          color="primary"
          aria-label="Add expense"
          onClick={openAddExpenseModal}
          sx={{ display: hideAddExpense ? "none" : { xs: "flex", md: "none" }, position: "fixed", bottom: 24, right: 24 }}
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
            <MenuItem onClick={() => {
              setConfirmDialogText("Leave this group? You will no longer be a member.");
              setConfirmAction(() => () => handleRemoveMember(menuMemberId));
              setShowConfirmDialog(true);
            }} sx={{ color: "error.main" }}>
              <GroupRemoveIcon sx={{ mr: 1 }} fontSize="small" />
              <ListItemText>Leave Group</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => {
              setConfirmDialogText("Close this group? All expenses and data will be permanently deleted.");
              setConfirmAction(() => handleCloseGroup);
              setShowConfirmDialog(true);
            }} sx={{ color: "error.main" }}>
              <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
              <ListItemText>Close Group</ListItemText>
            </MenuItem>
          </>
        ) : menuMemberId && menuMemberId === user?.id ? (
          <MenuItem onClick={() => {
            setConfirmDialogText("Leave this group? You will no longer be a member.");
            setConfirmAction(() => () => handleRemoveMember(menuMemberId));
            setShowConfirmDialog(true);
          }} sx={{ color: "error.main" }}>
            <GroupRemoveIcon sx={{ mr: 1 }} fontSize="small" />
            <ListItemText>Leave Group</ListItemText>
          </MenuItem>
        ) : menuMemberId && isCreator && menuMemberId !== group.created_by ? (
          <MenuItem onClick={() => {
            const memberName = group.members.find(m => m.user_id === menuMemberId)?.username || "this member";
            setConfirmDialogText(`Remove ${memberName} from this group?`);
            setConfirmAction(() => () => handleRemoveMember(menuMemberId));
            setShowConfirmDialog(true);
          }} sx={{ color: "error.main" }}>
            <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
            <ListItemText>Remove from Group</ListItemText>
          </MenuItem>
        ) : null}
      </Menu>

      <Dialog
        fullWidth
        maxWidth="xs"
        open={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
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
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography>{confirmDialogText}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button fullWidth variant="outlined" onClick={() => setShowConfirmDialog(false)}>
            Cancel
          </Button>
          <Button fullWidth variant="contained" color="error" onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        open={showAddExpenseModal}
        onClose={(_, reason) => { if (reason !== "backdropClick") { setShowAddExpenseModal(false); setAddImages([]); } }}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2 } }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 3, pt: 2 }}>
          <DialogTitle sx={{ fontWeight: 700, p: 0 }}>New Expense</DialogTitle>
          <IconButton onClick={() => setShowAddExpenseModal(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ pt: 2 }}>
          <ExpenseForm
            title={addTitle}
            onTitleChange={setAddTitle}
            notes={addNotes}
            onNotesChange={setAddNotes}
            amount={addAmount}
            onAmountChange={setAddAmount}
            currency={addCurrency}
            onCurrencyChange={setAddCurrency}
            paidBy={addPaidBy}
            onPaidByChange={setAddPaidBy}
            paidByUser={addPaidByUser}
            onPaidByUserChange={setAddPaidByUser}
            splitType={addSplitType}
            onSplitTypeChange={setAddSplitType}
            selectedParticipants={addSelectedParticipants}
            onParticipantsChange={setAddSelectedParticipants}
            exactSplits={addExactSplits}
            onExactSplitsChange={setAddExactSplits}
            percentSplits={addPercentSplits}
            onPercentSplitsChange={setAddPercentSplits}
            members={group.members}
            defaultCurrency={group.default_currency}
            onSubmit={handleAddExpense}
            submitDisabled={!addTitle.trim() || !addAmount || !addPaidBy || !isExactValid || !isPercentValid}
            loading={isAddingExpense || isUploadingImages}
            images={addImages}
            onImagesChange={setAddImages}
            date={addDate}
            onDateChange={setAddDate}
            category={addCategory}
            onCategoryChange={setAddCategory}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="sm"
        open={showEditExpenseModal}
        onClose={() => { setShowEditExpenseModal(false); setEditImages([]); }}
        PaperProps={{ sx: { borderRadius: 2 } }}
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
                if (window.confirm("Delete this expense? This cannot be undone.")) {
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
            title={editTitle}
            onTitleChange={setEditTitle}
            notes={editNotes}
            onNotesChange={setEditNotes}
            amount={editAmount}
            onAmountChange={setEditAmount}
            currency={editCurrency}
            onCurrencyChange={setEditCurrency}
            paidBy={editPaidBy}
            onPaidByChange={setEditPaidBy}
            paidByUser={editPaidByUser}
            onPaidByUserChange={setEditPaidByUser}
            splitType={editSplitType}
            onSplitTypeChange={setEditSplitType}
            selectedParticipants={editSelectedParticipants}
            onParticipantsChange={setEditSelectedParticipants}
            exactSplits={editExactSplits}
            onExactSplitsChange={setEditExactSplits}
            percentSplits={editPercentSplits}
            onPercentSplitsChange={setEditPercentSplits}
            members={group.members}
            defaultCurrency={group.default_currency}
            onSubmit={handleEditExpense}
            submitDisabled={!editTitle.trim() || !editAmount || !editPaidBy || !isEditExactValid || !isEditPercentValid}
            submitLabel="Save Changes"
            loading={isUpdatingExpense || isUploadingImages}
            images={editImages}
            onImagesChange={setEditImages}
            existingImages={selectedExpense?.images}
            existingImageUrls={editImageUrls}
            onDeleteExistingImage={(imageId) => deleteExpenseImage({ expenseId: selectedExpense!._id, imageId })}
            isDeletingImage={isDeletingExpenseImage}
            isEditing
            date={editDate}
            onDateChange={setEditDate}
            category={editCategory}
            onCategoryChange={setEditCategory}
          />
        </DialogContent>
      </Dialog>

      {/* View Expense Modal (read-only) */}
      <Dialog
        fullWidth
        maxWidth="xs"
        open={showViewExpenseModal}
        onClose={() => setShowViewExpenseModal(false)}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        {viewExpenseItem && (() => {
          const e = viewExpenseItem;
          const payer = group.members.find((m) => m.user_id === e.paid_by);
          const splitTypeLabel = e.split_type === "equal" ? "Equal split" : e.split_type === "exact" ? "Exact amounts" : "By percentage";
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
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                  <Chip label={splitTypeLabel} size="small" sx={{ fontWeight: 600, fontSize: "0.7rem" }} />
                  {e.category && (
                    <Chip label={e.category} size="small" variant="outlined" sx={{ fontWeight: 500, fontSize: "0.7rem" }} />
                  )}
                </Box>
              </Box>

              <DialogContent sx={{ px: 3, pt: 1, pb: 2 }}>
                {/* Paid by */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.25, mb: 1.5 }}>
                  <Avatar src={payer?.avatar || undefined} sx={{ width: 32, height: 32 }}>
                    {payer?.username?.[0]?.toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>Paid by</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{payer?.username ?? "Unknown"}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                    {new Date(e.date).toLocaleString()}
                  </Typography>
                </Box>

                {/* Notes */}
                {e.notes && (
                  <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.25, mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>Notes</Typography>
                    <Typography variant="body2">{e.notes}</Typography>
                  </Box>
                )}

                {/* Splits */}
                {e.splits && e.splits.length > 0 && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                      Split
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                      {e.splits.map((split) => {
                        const member = group.members.find((m) => m.user_id === split.user_id);
                        return (
                          <Box key={split.user_id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Avatar src={member?.avatar || undefined} sx={{ width: 28, height: 28, fontSize: 11 }}>
                              {member?.username?.[0]?.toUpperCase()}
                            </Avatar>
                            <Typography variant="body2" sx={{ flexGrow: 1 }}>{member?.username ?? "?"}</Typography>
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
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                      Photos
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      {e.images.map((img) => {
                        const urlEntry = viewImageUrls.find((u) => u._id === img._id);
                        return (
                          <Box
                            key={img._id}
                            sx={{ width: 80, height: 80, flexShrink: 0, borderRadius: 1, overflow: "hidden", cursor: urlEntry ? "pointer" : "default", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}
                            onClick={() => urlEntry && setLightboxUrl(urlEntry.signedUrl)}
                          >
                            {urlEntry ? (
                              <Box component="img" src={urlEntry.signedUrl} sx={{ width: 80, height: 80, objectFit: "cover", display: "block" }} />
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
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="xs"
        open={showSettleModal}
        onClose={() => setShowSettleModal(false)}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 3, pt: 2.5 }}>
          <DialogTitle sx={{ fontWeight: 700, p: 0, fontSize: "1.15rem" }}>Confirm Settlement</DialogTitle>
          <IconButton onClick={() => setShowSettleModal(false)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2, pb: 1 }}>
          {selectedSettlement && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Flow visualization */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  p: 2.5,
                  bgcolor: "action.hover",
                  borderRadius: 3,
                }}
              >
                {/* From user */}
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, flex: 1 }}>
                  <Avatar
                    src={selectedSettlement.fromUser.avatar || undefined}
                    sx={{ width: 52, height: 52 }}
                  >
                    {selectedSettlement.fromUser.username[0]?.toUpperCase()}
                  </Avatar>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                    {selectedSettlement.fromUser.username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Paying</Typography>
                </Box>

                {/* Arrow + amount */}
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "success.main", whiteSpace: "nowrap" }}>
                    {formatCurrency(selectedSettlement.amount, selectedSettlement.currency)}
                  </Typography>
                  <EastIcon sx={{ fontSize: 28, color: "success.main" }} />
                </Box>

                {/* To user */}
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, flex: 1 }}>
                  <Avatar
                    src={selectedSettlement.toUser.avatar || undefined}
                    sx={{ width: 52, height: 52 }}
                  >
                    {selectedSettlement.toUser.username[0]?.toUpperCase()}
                  </Avatar>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                    {selectedSettlement.toUser.username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Receiving</Typography>
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                Confirm that <strong>{selectedSettlement.fromUser.username}</strong> has paid <strong>{selectedSettlement.toUser.username}</strong>.
              </Typography>

              <TextField
                label="Amount"
                type="number"
                fullWidth
                size="small"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                inputProps={{ min: 0.01, step: 0.01 }}
                InputProps={{ endAdornment: <Typography variant="caption" sx={{ ml: 0.5, color: "text.secondary" }}>{selectedSettlement.currency}</Typography> }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 2 }}>
          <Button
            fullWidth
            variant="contained"
            color="success"
            startIcon={<CheckIcon />}
            disabled={isSettlingDebt || !settleAmount || parseFloat(settleAmount) <= 0}
            loading={isSettlingDebt}
            onClick={async () => {
              if (!selectedSettlement) return;
              await new Promise<void>((resolve) => {
                settleDebt(
                  {
                    from: selectedSettlement.from,
                    to: selectedSettlement.to,
                    amount: parseFloat(settleAmount),
                    currency: selectedSettlement.currency,
                  },
                  {
                    onSuccess: () => {
                      enqueueSnackbar("Settled!", { variant: "success" });
                      setShowSettleModal(false);
                      resolve();
                    },
                    onError: (error: Error) => {
                      enqueueSnackbar(error?.message || "Failed to settle", { variant: "error" });
                      resolve();
                    },
                  }
                );
              });
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox */}
      <Dialog
        open={!!lightboxUrl}
        onClose={() => setLightboxUrl(null)}
        fullScreen
        PaperProps={{ sx: { bgcolor: "black", position: "relative" } }}
      >
        {lightboxUrl && (
          <IconButton
            component="a"
            href={lightboxUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            sx={{ position: "absolute", top: 8, right: 48, zIndex: 1, bgcolor: "rgba(255,255,255,0.15)", color: "white", "&:hover": { bgcolor: "rgba(255,255,255,0.3)" } }}
          >
            <FileDownloadIcon />
          </IconButton>
        )}
        <IconButton
          onClick={() => setLightboxUrl(null)}
          size="small"
          sx={{ position: "absolute", top: 8, right: 8, zIndex: 1, bgcolor: "rgba(255,255,255,0.15)", color: "white", "&:hover": { bgcolor: "rgba(255,255,255,0.3)" } }}
        >
          <CloseIcon />
        </IconButton>
        {lightboxUrl && (
          <Box
            component="img"
            src={lightboxUrl}
            sx={{ width: "100%", height: "100vh", objectFit: "contain", display: "block" }}
          />
        )}
      </Dialog>
    </Box>
  );
}