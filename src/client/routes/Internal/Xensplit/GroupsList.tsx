import { useState } from "react";
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import GroupsIcon from "@mui/icons-material/Groups";
import { useXenSplits } from "../../../hooks/xensplit/useGroups";
import { useXenSplitGroupsSocket } from "../../../hooks/xensplit/useXenSplitSocket";
import { useTitle } from "../../../hooks/useTitle";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import GroupCard from "./components/GroupCard";
import { useAuth } from "../../../contexts/AuthContext";
import { ALL_CURRENCIES } from "../../../utils/currencyUtils";

export default function GroupsList() {
  useTitle("Xensplit");
  useXenSplitGroupsSocket();
  const { groups, isLoading, isError, error, createGroup, isCreating } = useXenSplits();
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [primaryCurrency, setPrimaryCurrency] = useState("CAD");

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    await new Promise<void>((resolve) => {
      createGroup(
        { name: groupName, default_currency: primaryCurrency },
        {
          onSuccess: () => {
            setShowCreateModal(false);
            setGroupName("");
            setPrimaryCurrency("CAD");
            resolve();
          },
        }
      );
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorDisplay error={error} />;

  return (
    <Box>
      <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, px: { xs: 1.5, sm: 3 } }}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: { xs: 2, sm: 3 },
          }}
        >
          <Box>
            <Typography
              variant="h5"
              component="h1"
              sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              Xensplit
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {groups.length > 0
                ? `${groups.length} group${groups.length === 1 ? "" : "s"}`
                : "Split expenses with friends"}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateModal(true)}
            size="medium"
          >
            New Group
          </Button>
        </Box>

        {/* Group list */}
        {groups.length === 0 ? (
          <Box
            sx={{
              textAlign: "center",
              py: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                bgcolor: "action.hover",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 0.5,
              }}
            >
              <GroupsIcon sx={{ fontSize: 32, color: "text.disabled" }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              No groups yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create a group to start splitting expenses
            </Typography>

          </Box>
        ) : (
          <Grid container spacing={1.5}>
            {groups.map((group) => (
              <Grid size={{ xs: 12, sm: 6 }} key={group._id}>
                <GroupCard group={group} userId={user?.id ?? ""} />
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      <Dialog
        fullWidth
        maxWidth="sm"
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <Box sx={{ position: "relative" }}>
          <IconButton
            onClick={() => setShowCreateModal(false)}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              bgcolor: "rgba(0,0,0,0.3)",
              color: "white",
              "&:hover": { bgcolor: "rgba(0,0,0,0.5)" },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <DialogTitle sx={{ fontWeight: 700 }}>Create Group</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Group Name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            sx={{ mt: 1 }}
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Primary Currency</InputLabel>
            <Select
              value={primaryCurrency}
              label="Primary Currency"
              onChange={(e) => setPrimaryCurrency(e.target.value)}
            >
              {ALL_CURRENCIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button fullWidth variant="outlined" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={handleCreate}
            disabled={!groupName.trim() || isCreating}
            loading={isCreating}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
