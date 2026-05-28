import { useState } from "react";
import { useSnackbar } from "notistack";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Avatar,
  AvatarGroup,
  InputAdornment,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import { useXenSplit } from "../../../hooks/xensplit/useGroup";
import { useXenSplitExpenses } from "../../../hooks/xensplit/useExpenses";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import UserSelect from "../../../components/UserSelect";
import { SearchedUser } from "../../../hooks/useUserSearch";

export default function AddExpense() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { group, isLoading, isError, error } = useXenSplit(groupId!);
  const { addExpense, isAddingExpense, addExpenseError } = useXenSplitExpenses(groupId!);

  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [splitType, setSplitType] = useState<"equal" | "exact" | "percent">("equal");
  const [selectedParticipants, setSelectedParticipants] = useState<SearchedUser[]>([]);
  const [exactSplits, setExactSplits] = useState<{ [userId: string]: string }>({});
  const [percentSplits, setPercentSplits] = useState<{ [userId: string]: string }>({});

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorDisplay error={error} />;
  if (!group) return null;

  const [currency, setCurrency] = useState(group.currencies[0] || "USD");

  const handleSubmit = async () => {
    if (!description.trim() || !amount || !paidBy) return;

    const numAmount = parseFloat(amount);
    let splits = undefined;

    if (splitType === "equal") {
      splits = selectedParticipants.map((p) => ({
        user_id: p._id,
      }));
    } else if (splitType === "exact") {
      splits = selectedParticipants.map((p) => ({
        user_id: p._id,
        amount_owed: parseFloat(exactSplits[p._id] || "0"),
      }));
    } else if (splitType === "percent") {
      splits = selectedParticipants.map((p) => ({
        user_id: p._id,
        percentage: parseFloat(percentSplits[p._id] || "0"),
      }));
    }

    await new Promise<void>((resolve) => {
      addExpense(
        {
          paid_by: paidBy,
          amount: numAmount,
          currency,
          description,
          notes: notes.trim() || undefined,
          split_type: splitType,
          splits,
        },
        {
          onSuccess: () => {
            enqueueSnackbar("Expense added", { variant: "success" });
            navigate(`/internal/xensplit/groups/${groupId}`);
            resolve();
          },
        }
      );
    });
  };

  const totalExact = Object.values(exactSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const totalPercent = Object.values(percentSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const numAmount = parseFloat(amount) || 0;

  return (
    <Box>
      <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4 }}>
          <IconButton onClick={() => navigate(`/internal/xensplit/groups/${groupId}`)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            Add Expense
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <TextField
            fullWidth
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <TextField
            fullWidth
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
          />

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              fullWidth
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <TextField
              select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
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
                  onClick={() => setPaidBy(paidBy === member.user_id ? "" : member.user_id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    cursor: "pointer",
                    bgcolor: paidBy === member.user_id ? "primary.main" : "action.hover",
                    color: paidBy === member.user_id ? "primary.contrastText" : "text.primary",
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
              value={splitType}
              exclusive
              onChange={(_, v) => v && setSplitType(v)}
              fullWidth
            >
              <ToggleButton value="equal">Equal</ToggleButton>
              <ToggleButton value="exact">Exact</ToggleButton>
              <ToggleButton value="percent">Percent</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {splitType !== "equal" && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Participants
              </Typography>
              <UserSelect
                value={selectedParticipants}
                onChange={setSelectedParticipants}
                label="Select participants"
                placeholder="Who is splitting this?"
                excludeUserIds={selectedParticipants.map((p) => p._id)}
                includeSelf={true}
              />
            </Box>
          )}

          {splitType === "equal" && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Split between all members
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <AvatarGroup max={6}>
                  {group.members.map((member) => (
                    <Avatar key={member.user_id} src={member.avatar || undefined} sx={{ width: 32, height: 32, bgcolor: "primary.main" }}>
                      {member.username[0]?.toUpperCase()}
                    </Avatar>
                  ))}
                </AvatarGroup>
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
                  {numAmount > 0 ? `${currency} ${(numAmount / group.members.length).toFixed(2)} each` : ""}
                </Typography>
              </Box>
            </Box>
          )}

          {splitType === "exact" && selectedParticipants.length > 0 && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="subtitle2">Exact amounts</Typography>
                <Typography variant="caption" color={Math.abs(totalExact - numAmount) < 0.01 ? "success" : "error"}>
                  Total: {totalExact.toFixed(2)} / {numAmount.toFixed(2)}
                </Typography>
              </Box>
              {selectedParticipants.map((p) => (
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
                    value={exactSplits[p._id] || ""}
                    onChange={(e) => setExactSplits({ ...exactSplits, [p._id]: e.target.value })}
                    sx={{ flexGrow: 1 }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {splitType === "percent" && selectedParticipants.length > 0 && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="subtitle2">Percentages</Typography>
                <Typography variant="caption" color={Math.abs(totalPercent - 100) < 0.01 ? "success" : "error"}>
                  Total: {totalPercent.toFixed(1)}% / 100%
                </Typography>
              </Box>
              {selectedParticipants.map((p) => (
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
                    value={percentSplits[p._id] || ""}
                    onChange={(e) => setPercentSplits({ ...percentSplits, [p._id]: e.target.value })}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                    sx={{ flexGrow: 1 }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {addExpenseError && (
            <Typography variant="body2" color="error">
              {(addExpenseError as Error).message}
            </Typography>
          )}

          <Button
            fullWidth
            variant="contained"
            onClick={handleSubmit}
            disabled={!description.trim() || !amount || !paidBy || isAddingExpense}
            loading={isAddingExpense}
            sx={{ mt: 2 }}
          >
            Add Expense
          </Button>
        </Box>
      </Container>
    </Box>
  );
}