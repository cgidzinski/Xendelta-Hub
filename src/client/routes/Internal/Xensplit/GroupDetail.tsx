import { useState } from "react";
import { useSnackbar } from "notistack";
import { useParams, useNavigate } from "react-router-dom";
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EastIcon from "@mui/icons-material/East";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteIcon from "@mui/icons-material/Delete";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import { useXenSplit } from "../../../hooks/xensplit/useGroup";
import { useXenSplits } from "../../../hooks/xensplit/useGroups";
import { useXenSplitBalances } from "../../../hooks/xensplit/useBalances";
import { useXenSplitExpenses } from "../../../hooks/xensplit/useExpenses";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import UserSelect from "../../../components/UserSelect";
import { SearchedUser } from "../../../hooks/useUserSearch";
import ExpenseForm from "./components/ExpenseForm";
import type { XenSplitExpense, XenSplitSettlementTransfer } from "../../../hooks/xensplit/types";

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { group, isLoading, isError, error, addMembers, isAddingMembers, removeMember, isRemovingMember } = useXenSplit(groupId!);
  const { deleteGroup } = useXenSplits();
  const { balancesData, settleDebt, isSettlingDebt } = useXenSplitBalances(groupId!);
  const { updateExpense, isUpdatingExpense, addExpense, isAddingExpense } = useXenSplitExpenses(groupId!);
  const [activeTab, setActiveTab] = useState(0);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SearchedUser[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<XenSplitExpense | null>(null);
  const [addDescription, setAddDescription] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addCurrency, setAddCurrency] = useState("USD");
  const [addPaidBy, setAddPaidBy] = useState("");
  const [addPaidByUser, setAddPaidByUser] = useState<SearchedUser | null>(null);
  const [addSplitType, setAddSplitType] = useState<"equal" | "exact" | "percent">("equal");
  const [addSelectedParticipants, setAddSelectedParticipants] = useState<SearchedUser[]>([]);
  const [addExactSplits, setAddExactSplits] = useState<{ [userId: string]: string }>({});
  const [addPercentSplits, setAddPercentSplits] = useState<{ [userId: string]: string }>({});
  const [editDescription, setEditDescription] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editPaidBy, setEditPaidBy] = useState("");
  const [editPaidByUser, setEditPaidByUser] = useState<SearchedUser | null>(null);
  const [editSplitType, setEditSplitType] = useState<"equal" | "exact" | "percent">("equal");
  const [editSelectedParticipants, setEditSelectedParticipants] = useState<SearchedUser[]>([]);
  const [editExactSplits, setEditExactSplits] = useState<{ [userId: string]: string }>({});
  const [editPercentSplits, setEditPercentSplits] = useState<{ [userId: string]: string }>({});
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<XenSplitSettlementTransfer | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogText, setConfirmDialogText] = useState("");
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

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
          setShowAddMemberModal(false);
          setSelectedMembers([]);
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
        onError: (error: any) => {
          const message = error?.response?.data?.message || "Failed to remove member";
          enqueueSnackbar(message, { variant: "error" });
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
        onError: () => {
          enqueueSnackbar("Failed to close group", { variant: "error" });
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
    await new Promise<void>((resolve) => {
      fetch(`/api/xensplit/groups/${groupId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId: menuMemberId }),
      }).then((res) => {
        if (res.ok) {
          enqueueSnackbar("Ownership transferred", { variant: "success" });
        } else {
          enqueueSnackbar("Failed to transfer ownership", { variant: "error" });
        }
        setMenuAnchor(null);
        setMenuMemberId(null);
        resolve();
      });
    });
  };

  const handleAddExpense = async () => {
    if (!addDescription.trim() || !addAmount || !addPaidBy) return;

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
          description: addDescription,
          notes: addNotes.trim() || undefined,
          split_type: addSplitType,
          splits,
        },
        {
          onSuccess: () => {
            enqueueSnackbar("Expense added", { variant: "success" });
            setShowAddExpenseModal(false);
            setAddDescription("");
            setAddNotes("");
            setAddAmount("");
            setAddCurrency("USD");
            setAddPaidBy("");
            setAddPaidByUser(null);
            setAddSplitType("equal");
            setAddSelectedParticipants([]);
            setAddExactSplits({});
            setAddPercentSplits({});
            resolve();
          },
        }
      );
    });
  };

  const handleEditExpense = async () => {
    if (!selectedExpense || !editDescription.trim() || !editAmount || !editPaidBy) return;

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
        { expenseId: selectedExpense._id, updates: {
          paid_by: editPaidBy,
          amount: numAmount,
          currency: editCurrency,
          description: editDescription,
          notes: editNotes.trim() || undefined,
          split_type: editSplitType,
          splits,
        } },
        {
          onSuccess: () => {
            enqueueSnackbar("Expense updated", { variant: "success" });
            setShowEditExpenseModal(false);
            resolve();
          },
        }
      );
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  };

  return (
    <Box>
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4 }}>
          <IconButton onClick={() => navigate("/internal/xensplit/groups")}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              {group.name}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
              <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 24, height: 24, fontSize: 11 } }}>
                {group.members.map((m) => (
                  <Avatar key={m.user_id} src={m.avatar || undefined} sx={{ bgcolor: "primary.main" }}>
                    {m.username[0]?.toUpperCase()}
                  </Avatar>
                ))}
              </AvatarGroup>
              <Typography variant="caption" color="text.secondary">
                {group.members.length} members
              </Typography>
            </Box>
          </Box>
        </Box>

        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
          <Tab label="Expenses" />
          <Tab label="Balances" />
          <Tab label="Settlements" />
          <Tab label="Members" />
        </Tabs>

        {activeTab === 0 && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                Expenses
              </Typography>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setShowAddExpenseModal(true)}>
                Add Expense
              </Button>
            </Box>
            {group.expenses.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography variant="body1" color="text.secondary">
                  No expenses yet
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {group.expenses.map((expense) => (
                  <Box
                    key={expense._id}
                    onClick={() => {
                      setSelectedExpense(expense);
                      setEditDescription(expense.description);
                      setEditNotes(expense.notes || "");
                      setEditAmount(expense.amount.toString());
                      setEditCurrency(expense.currency);
                      setEditPaidBy(expense.paid_by);
                      const payerMember = group.members.find((m) => m.user_id === expense.paid_by);
                      setEditPaidByUser(payerMember ? { _id: payerMember.user_id, username: payerMember.username, avatar: payerMember.avatar } : null);
                      setEditSplitType(expense.split_type as "equal" | "exact" | "percent");
                      if (expense.splits && expense.splits.length > 0) {
                        const participants = expense.splits.map((s) => {
                          const member = group.members.find((m) => m.user_id === s.user_id);
                          return member ? { _id: member.user_id, username: member.username, avatar: member.avatar } : null;
                        }).filter(Boolean) as SearchedUser[];
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
                      setShowEditExpenseModal(true);
                    }}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      p: 2,
                      bgcolor: "action.hover",
                      borderRadius: 2,
                      mb: 1,
                      cursor: "pointer",
                      height: 72,
                      "&:hover": { bgcolor: "action.selected" },
                    }}
                  >
                    <Avatar src={expense.payer?.avatar || undefined} sx={{ bgcolor: "primary.main", width: 40, height: 40, flexShrink: 0 }}>
                      {expense.payer?.username?.[0]?.toUpperCase() || "?"}
                    </Avatar>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {expense.description}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        Paid by {expense.payer?.username || "?"} · {new Date(expense.date).toLocaleString()}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      <Typography variant="subtitle2" color="success.main" sx={{ fontWeight: 700 }}>
                        {formatCurrency(expense.amount, expense.currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                        {expense.split_type}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </List>
            )}
          </Box>
        )}

        {activeTab === 1 && balancesData && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                Balances
              </Typography>
            </Box>
            {Object.entries(balancesData.balances).map(([userId, balance]) => {
              const nonZeroBalances = Object.entries(balance.balances).filter(([_, amount]) => amount !== 0);
              if (nonZeroBalances.length === 0) return null;
              return (
                <Box
                  key={userId}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    p: 2,
                    bgcolor: "action.hover",
                    borderRadius: 2,
                    mb: 1,
                    height: 72,
                  }}
                >
                  <Avatar src={balance.user.avatar || undefined} sx={{ bgcolor: "primary.main" }}>
                    {balance.user.username[0]?.toUpperCase()}
                  </Avatar>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle2">{balance.user.username}</Typography>
                  </Box>
                  {nonZeroBalances.map(([currency, amount]) => (
                    <Typography
                      key={currency}
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        color: (amount as number) >= 0 ? "success.main" : "error.main",
                      }}
                    >
                      {(amount as number) >= 0 ? "Owed " : "Owes "}
                      {formatCurrency(Math.abs(amount as number), currency)}
                    </Typography>
                  ))}
                </Box>
              );
            })}
            {Object.values(balancesData.balances).every((balance) =>
              Object.values(balance.balances).every((amount) => amount === 0)
            ) && (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  Nothing Yet
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {activeTab === 2 && balancesData && balancesData.settlements.length > 0 && (
          <Box>
            <Box sx={{ mb: 2, minHeight: 48, display: "flex", alignItems: "center" }}>
              <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                Settlements
              </Typography>
            </Box>
            {balancesData.settlements.map((settlement, idx) => (
              <Box key={idx} sx={{ display: "flex", alignItems: "stretch", gap: 1, mb: 1 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    flexGrow: 1,
                    px: 2,
                    bgcolor: "action.hover",
                    borderRadius: 2,
                    height: 72,
                  }}
                >
                  <Avatar src={settlement.fromUser.avatar || undefined} sx={{ width: 40, height: 40, bgcolor: "primary.main" }}>
                    {settlement.fromUser.username[0]?.toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" sx={{ fontWeight: 500, flexShrink: 0 }}>
                    {settlement.fromUser.username}
                  </Typography>
                  <EastIcon sx={{ fontSize: 16, color: "text.disabled", mx: 1, flexShrink: 0 }} />
                  <Avatar src={settlement.toUser.avatar || undefined} sx={{ width: 40, height: 40, bgcolor: "success.main" }}>
                    {settlement.toUser.username[0]?.toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" sx={{ fontWeight: 500, flexShrink: 0 }}>
                    {settlement.toUser.username}
                  </Typography>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      ml: "auto",
                      flexShrink: 0,
                      color: settlement.from === user?.id
                        ? "error.main"
                        : settlement.to === user?.id
                        ? "success.main"
                        : "text.primary",
                    }}
                  >
                    {formatCurrency(settlement.amount, settlement.currency)}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  color="success"
                  sx={{ height: 72, borderRadius: 2, px: 3 }}
                  onClick={() => {
                    setSelectedSettlement(settlement);
                    setShowSettleModal(true);
                  }}
                >
                  Settle
                </Button>
              </Box>
            ))}
          </Box>
        )}

        {activeTab === 3 && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                Members
              </Typography>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setShowAddMemberModal(true)}>
                Add Members
              </Button>
            </Box>
            <List disablePadding>
              {group.members.map((member) => (
                <ListItem
                  key={member.user_id}
                  sx={{ bgcolor: "action.hover", borderRadius: 2, mb: 1, pr: 1, height: 72 }}
                >
                  <ListItemAvatar>
                    <Avatar src={member.avatar || undefined} sx={{ bgcolor: "primary.main" }}>
                      {member.username[0]?.toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={member.username}
                    secondary={member.user_id === group.created_by ? "Creator" : ""}
                  />
                  {user && (member.user_id === user.id || (isCreator && member.user_id !== group.created_by)) && (
                    <IconButton
                      onClick={(e) => {
                        setMenuAnchor(e.currentTarget);
                        setMenuMemberId(member.user_id);
                      }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </ListItem>
              ))}
            </List>
          </Box>
        )}
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
            Add Members
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
        open={showAddExpenseModal}
        onClose={() => setShowAddExpenseModal(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 3, pt: 2 }}>
          <DialogTitle sx={{ fontWeight: 700, p: 0 }}>Add Expense</DialogTitle>
          <IconButton onClick={() => setShowAddExpenseModal(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ pt: 2 }}>
          <ExpenseForm
            description={addDescription}
            onDescriptionChange={setAddDescription}
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
            currencies={group.currencies}
            onSubmit={handleAddExpense}
            submitDisabled={!addDescription.trim() || !addAmount || !addPaidBy || !isExactValid || !isPercentValid}
            loading={isAddingExpense}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="sm"
        open={showEditExpenseModal}
        onClose={() => setShowEditExpenseModal(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 3, pt: 2 }}>
          <DialogTitle sx={{ fontWeight: 700, p: 0 }}>Edit Expense</DialogTitle>
          <IconButton onClick={() => setShowEditExpenseModal(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ pt: 2 }}>
          <ExpenseForm
            description={editDescription}
            onDescriptionChange={setEditDescription}
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
            currencies={group.currencies}
            onSubmit={handleEditExpense}
            submitDisabled={!editDescription.trim() || !editAmount || !editPaidBy || !isEditExactValid || !isEditPercentValid}
            submitLabel="Save Changes"
            loading={isUpdatingExpense}
          />
        </DialogContent>
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
                    sx={{ width: 52, height: 52, bgcolor: "error.main" }}
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
                    sx={{ width: 52, height: 52, bgcolor: "success.main" }}
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
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 2 }}>
          <Button
            fullWidth
            variant="contained"
            color="success"
            startIcon={<CheckIcon />}
            disabled={isSettlingDebt}
            loading={isSettlingDebt}
            onClick={async () => {
              if (!selectedSettlement) return;
              await new Promise<void>((resolve) => {
                settleDebt(
                  {
                    from: selectedSettlement.from,
                    to: selectedSettlement.to,
                    amount: selectedSettlement.amount,
                    currency: selectedSettlement.currency,
                  },
                  {
                    onSuccess: () => {
                      enqueueSnackbar("Settled!", { variant: "success" });
                      setShowSettleModal(false);
                      resolve();
                    },
                    onError: () => {
                      enqueueSnackbar("Failed to settle", { variant: "error" });
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
    </Box>
  );
}