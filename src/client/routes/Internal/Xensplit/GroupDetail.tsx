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
  TextField,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditIcon from "@mui/icons-material/Edit";
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
import type { XenSplitExpense } from "../../../hooks/xensplit/types";

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { group, isLoading, isError, error, addMembers, isAddingMembers, removeMember, isRemovingMember } = useXenSplit(groupId!);
  const { deleteGroup } = useXenSplits();
  const { balancesData } = useXenSplitBalances(groupId!);
  const { updateExpense, isUpdatingExpense } = useXenSplitExpenses(groupId!);
  const [activeTab, setActiveTab] = useState(0);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SearchedUser[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<XenSplitExpense | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editPaidBy, setEditPaidBy] = useState("");
  const [editSplitType, setEditSplitType] = useState<"equal" | "exact" | "percent">("equal");
  const [editSelectedParticipants, setEditSelectedParticipants] = useState<SearchedUser[]>([]);
  const [editExactSplits, setEditExactSplits] = useState<{ [userId: string]: string }>({});
  const [editPercentSplits, setEditPercentSplits] = useState<{ [userId: string]: string }>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogText, setConfirmDialogText] = useState("");
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

  const handleConfirm = () => {
    confirmAction();
    setShowConfirmDialog(false);
  };

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

  const handleEditExpense = async () => {
    if (!selectedExpense || !editDescription.trim() || !editAmount || !editPaidBy) return;

    const numAmount = parseFloat(editAmount);
    let splits = undefined;

    if (editSplitType === "equal") {
      splits = group.members.map((m) => ({
        user_id: m.user_id,
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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate(`/internal/xensplit/groups/${groupId}/expense/new`)}
          >
            Add Expense
          </Button>
        </Box>

        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
          <Tab label="Expenses" />
          <Tab label="Balances" />
          <Tab label="Settlements" />
          <Tab label="Members" />
        </Tabs>

        {activeTab === 0 && (
          <Box>
            {group.expenses.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography variant="body1" color="text.secondary">
                  No expenses yet
                </Typography>
              </Box>
            ) : (
              <List>
                {group.expenses.map((expense) => (
                  <ListItem
                    component="div"
                    onClick={() => {
                      setSelectedExpense(expense);
                      setEditDescription(expense.description);
                      setEditNotes(expense.notes || "");
                      setEditAmount(expense.amount.toString());
                      setEditCurrency(expense.currency);
                      setEditPaidBy(expense.paid_by);
                      setEditSplitType(expense.split_type as "equal" | "exact" | "percent");
                      // Build participants from splits
                      if (expense.splits && expense.splits.length > 0) {
                        const participants = expense.splits.map((s) => {
                          const member = group.members.find((m) => m.user_id === s.user_id);
                          return member ? { _id: member.user_id, username: member.username, avatar: member.avatar } : null;
                        }).filter(Boolean) as SearchedUser[];
                        setEditSelectedParticipants(participants);
                        // Build exact/percent maps
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
                      bgcolor: "action.hover",
                      borderRadius: 2,
                      mb: 1,
                      cursor: "pointer",
                      "&:hover": { bgcolor: "action.selected" },
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar src={expense.payer?.avatar || undefined} sx={{ bgcolor: "primary.main" }}>
                        {expense.payer?.username?.[0]?.toUpperCase() || "?"}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={expense.description}
                      secondary={new Date(expense.date).toLocaleString()}
                      sx={{ pr: 10 }}
                    />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 1 }}>
                      <Typography variant="subtitle2" color="success.main" sx={{ fontWeight: 700 }}>
                        {formatCurrency(expense.amount, expense.currency)}
                      </Typography>
                      <Chip
                        label={expense.split_type}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}

        {activeTab === 1 && balancesData && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Balances
            </Typography>
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
                      {(amount as number) >= 0 ? "+" : ""}
                      {formatCurrency(amount as number, currency)}
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
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Suggested Settlements
            </Typography>
            {balancesData.settlements.map((settlement, idx) => (
              <Box
                key={idx}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  p: 2,
                  bgcolor: "success.main",
                  color: "success.contrastText",
                  borderRadius: 2,
                  mb: 1,
                }}
              >
                <Avatar src={settlement.fromUser.avatar || undefined} sx={{ width: 28, height: 28 }}>
                  {settlement.fromUser.username[0]?.toUpperCase()}
                </Avatar>
                <Typography variant="body2">
                  {settlement.fromUser.username} owes {settlement.toUser.username}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, ml: "auto" }}>
                  {formatCurrency(settlement.amount, settlement.currency)}
                </Typography>
              </Box>
            ))}
            <Box sx={{ mt: 2, textAlign: "center" }}>
              <Button
                variant="contained"
                color="success"
                onClick={() => navigate(`/internal/xensplit/groups/${groupId}/settle`)}
              >
                Settle Up
              </Button>
            </Box>
          </Box>
        )}

        {activeTab === 3 && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setShowAddMemberModal(true)}>
                Add Members
              </Button>
            </Box>
            <List>
              {group.members.map((member) => (
                <ListItem
                  key={member.user_id}
                  sx={{ bgcolor: "action.hover", borderRadius: 2, mb: 1, pr: 1 }}
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
        maxWidth="xs"
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
        open={showEditExpenseModal}
        onClose={() => setShowEditExpenseModal(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Expense</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              fullWidth
              label="Description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />

            <TextField
              fullWidth
              label="Notes (optional)"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              multiline
              rows={2}
            />

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
              <TextField
                select
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ width: 100 }}
              >
                {group.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </TextField>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Paid by
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {group.members.map((member) => (
                  <Box
                    key={member.user_id}
                    onClick={() => setEditPaidBy(editPaidBy === member.user_id ? "" : member.user_id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 2,
                      py: 1,
                      borderRadius: 2,
                      cursor: "pointer",
                      bgcolor: editPaidBy === member.user_id ? "primary.main" : "action.hover",
                      color: editPaidBy === member.user_id ? "primary.contrastText" : "text.primary",
                      transition: "all 0.2s",
                    }}
                  >
                    <Avatar src={member.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                      {member.username[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="caption">
                      {member.username}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Split type
              </Typography>
              <ToggleButtonGroup
                value={editSplitType}
                exclusive
                onChange={(_, v) => v && setEditSplitType(v)}
                fullWidth
              >
                <ToggleButton value="equal">Equal</ToggleButton>
                <ToggleButton value="exact">Exact</ToggleButton>
                <ToggleButton value="percent">Percent</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {editSplitType !== "equal" && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Participants
                </Typography>
                <UserSelect
                  value={editSelectedParticipants}
                  onChange={setEditSelectedParticipants}
                  label="Select participants"
                  placeholder="Who is splitting this?"
                  excludeUserIds={editSelectedParticipants.map((p) => p._id)}
                  includeSelf={true}
                />
              </Box>
            )}

            {editSplitType === "exact" && editSelectedParticipants.length > 0 && (
              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="subtitle2">Exact amounts</Typography>
                  <Typography variant="caption" color={Math.abs(Object.values(editExactSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) - (parseFloat(editAmount) || 0)) < 0.01 ? "success" : "error"}>
                    Total: {Object.values(editExactSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0).toFixed(2)} / {editAmount}
                  </Typography>
                </Box>
                {editSelectedParticipants.map((p) => (
                  <Box key={p._id} sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                    <Avatar src={p.avatar || undefined} sx={{ width: 28, height: 28 }}>
                      {p.username[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="body2" sx={{ width: 100 }}>
                      {p.username}
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={editExactSplits[p._id] || ""}
                      onChange={(e) => setEditExactSplits({ ...editExactSplits, [p._id]: e.target.value })}
                      sx={{ flexGrow: 1 }}
                    />
                  </Box>
                ))}
              </Box>
            )}

            {editSplitType === "percent" && editSelectedParticipants.length > 0 && (
              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="subtitle2">Percentages</Typography>
                  <Typography variant="caption" color={Math.abs(Object.values(editPercentSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) - 100) < 0.01 ? "success" : "error"}>
                    Total: {Object.values(editPercentSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0).toFixed(1)}% / 100%
                  </Typography>
                </Box>
                {editSelectedParticipants.map((p) => (
                  <Box key={p._id} sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                    <Avatar src={p.avatar || undefined} sx={{ width: 28, height: 28 }}>
                      {p.username[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="body2" sx={{ width: 100 }}>
                      {p.username}
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={editPercentSplits[p._id] || ""}
                      onChange={(e) => setEditPercentSplits({ ...editPercentSplits, [p._id]: e.target.value })}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                      }}
                      sx={{ flexGrow: 1 }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button fullWidth variant="outlined" onClick={() => setShowEditExpenseModal(false)}>
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={handleEditExpense}
            disabled={!editDescription.trim() || !editAmount || !editPaidBy || isUpdatingExpense}
            loading={isUpdatingExpense}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}