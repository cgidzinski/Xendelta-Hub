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
  Autocomplete,
  Checkbox,
  ListItemText,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useXenSplits } from "../../../hooks/xensplit/useGroups";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import GroupCard from "./components/GroupCard";

const ALL_CURRENCIES = ["CAD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "INR", "MXN", "BRL"];

export default function GroupsList() {
  const { groups, isLoading, isError, error, createGroup, isCreating } = useXenSplits();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [primaryCurrency, setPrimaryCurrency] = useState("CAD");
  const [secondaryCurrencies, setSecondaryCurrencies] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    const currencies = [primaryCurrency, ...secondaryCurrencies.filter(c => c !== primaryCurrency)];
    await new Promise<void>((resolve) => {
      createGroup(
        { name: groupName, currencies },
        {
          onSuccess: () => {
            setShowCreateModal(false);
            setGroupName("");
            setPrimaryCurrency("CAD");
            setSecondaryCurrencies([]);
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
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              Xensplit
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Split expenses with friends
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateModal(true)}
          >
            New Group
          </Button>
        </Box>

        {groups.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              No groups yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Click "New Group" to create one
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {groups.map((group) => (
              <Grid size={{ xs: 6 }} key={group._id}>
                <GroupCard group={group} />
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
            sx={{ mt: 1, mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
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
          <Autocomplete
            multiple
            options={ALL_CURRENCIES.filter(c => c !== primaryCurrency)}
            disableCloseOnSelect
            value={secondaryCurrencies}
            onChange={(_, newValue) => setSecondaryCurrencies(newValue)}
            renderOption={(props, option, { selected }) => (
              <Box component="li" {...props} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Checkbox checked={selected} size="small" />
                <ListItemText primary={option} />
              </Box>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Secondary Currencies" placeholder="Search currencies..." />
            )}
          />
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
            Create Group
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}