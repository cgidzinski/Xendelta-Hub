import { useState, useMemo } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  MenuItem,
  IconButton,
  Tabs,
  Tab,
  Grid,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import StorageIcon from "@mui/icons-material/Storage";
import InventoryIcon from "@mui/icons-material/Inventory2";
import SettingsIcon from "@mui/icons-material/Settings";
import PersonIcon from "@mui/icons-material/Person";
import StarsIcon from "@mui/icons-material/Stars";
import { useSnackbar } from "notistack";
import { useTitle } from "../../hooks/useTitle";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import { useAdminUsers, User } from "../../hooks/admin/useAdminUsers";
import { formatFileSize } from "../../utils/fileUtils";

const AVAILABLE_ROLES = ["admin", "user"];

const ITEM_OPTIONS = [
  { value: "1000-point-voucher", label: "1000 Point Voucher" },
  { value: "1gb-xenbox-voucher", label: "1GB XenBox Voucher" },
  { value: "golden-badge", label: "Golden Badge" },
];

export default function Users() {
  useTitle("Users");
  const { enqueueSnackbar } = useSnackbar();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const {
    users,
    isLoading,
    updateUser,
    isUpdatingUser,
    deleteUser,
    isDeletingUser,
    resetAvatar,
    isResettingAvatar,
    giveItem,
    isGivingItem,
    removeItem,
    isRemovingItem,
    refetch,
  } = useAdminUsers();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);
  const [editingQuota, setEditingQuota] = useState<string>("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedGiftItem, setSelectedGiftItem] = useState<string>("");
  const [activeTab, setActiveTab] = useState(0);

  const filteredUsers = useMemo(() => {
    if (searchQuery.trim() === "") {
      return users;
    }
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.roles?.some((role) => role.toLowerCase().includes(query))
    );
  }, [searchQuery, users]);

  const getRoleColor = (role: string) => {
    const lowerRole = role.toLowerCase();
    switch (lowerRole) {
      case "admin":
        return "error";
      default:
        return "default";
    }
  };

  const handleUserClick = (user: User) => {
    setSelectedUser(user);
    setEditingRoles(user.roles || []);
    setEditingQuota(user.xenbox?.spaceAllowed ? formatFileSize(user.xenbox.spaceAllowed) : "");
    setUserModalOpen(true);
  };

  const handleCloseModal = () => {
    setUserModalOpen(false);
    setSelectedUser(null);
    setEditingRoles([]);
    setEditingQuota("");
    setActiveTab(0);
  };

  const handleSaveRoles = async () => {
    if (!selectedUser) return;
    updateUser(selectedUser._id, { roles: editingRoles })
      .then(() => {
        enqueueSnackbar("Roles updated successfully", { variant: "success" });
        // Update selected user
        const updatedUser = users.find(u => u._id === selectedUser._id);
        if (updatedUser) {
          setSelectedUser({ ...updatedUser, roles: editingRoles });
        }
      })
      .catch((error) => {
        enqueueSnackbar(error.message || "Failed to update roles", { variant: "error" });
      });
  };

  const parseQuotaInput = (input: string): number | null => {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return null;
    
    // Parse format like "5 GB", "1024 MB", etc.
    const match = trimmed.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/);
    if (!match) return null;
    
    const value = parseFloat(match[1]);
    if (isNaN(value) || value < 0) return null;
    
    const unit = match[2] || "B";
    const multipliers: { [key: string]: number } = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };
    
    return Math.floor(value * (multipliers[unit] || 1));
  };

  const handleSaveQuota = async () => {
    if (!selectedUser) return;
    
    const quotaBytes = parseQuotaInput(editingQuota);
    if (quotaBytes === null && editingQuota.trim() !== "") {
      enqueueSnackbar("Invalid quota format. Use format like '5 GB' or '1024 MB'", { variant: "error" });
      return;
    }
    
    updateUser(selectedUser._id, { xenboxQuota: quotaBytes || 0 })
      .then(async () => {
        enqueueSnackbar("Quota updated successfully", { variant: "success" });
        // Refetch users list
        const { data: updatedUsers } = await refetch();
        if (updatedUsers) {
          // Update selected user after refetch
          const updatedUser = updatedUsers.find(u => u._id === selectedUser._id);
          if (updatedUser) {
            setSelectedUser(updatedUser);
            setEditingQuota(updatedUser.xenbox?.spaceAllowed ? formatFileSize(updatedUser.xenbox.spaceAllowed) : "");
          }
        }
      })
      .catch((error) => {
        enqueueSnackbar(error.message || "Failed to update quota", { variant: "error" });
      });
  };


  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    deleteUser(selectedUser._id)
      .then(() => {
        enqueueSnackbar("User deleted successfully", { variant: "success" });
        setDeleteConfirmOpen(false);
        handleCloseModal();
      })
      .catch((error) => {
        enqueueSnackbar(error.message || "Failed to delete user", { variant: "error" });
      });
  };

  const handleResetAvatar = async () => {
    if (!selectedUser) return;
    resetAvatar(selectedUser._id)
      .then(() => {
        enqueueSnackbar("Avatar reset successfully", { variant: "success" });
        // Update selected user
        const updatedUser = users.find(u => u._id === selectedUser._id);
        if (updatedUser) {
          setSelectedUser({ ...updatedUser, avatar: undefined });
        }
        // If it's the current user, refetch profile to update sidebar
        if (selectedUser._id === profile?._id) {
          refetchProfile();
        }
      })
      .catch((error) => {
        enqueueSnackbar(error.message || "Failed to reset avatar", { variant: "error" });
      });
  };

  const handleGiveGift = async () => {
    if (!selectedUser || !selectedGiftItem) return;
    giveItem(selectedUser._id, selectedGiftItem)
      .then(() => {
        enqueueSnackbar("Gift sent successfully", { variant: "success" });
        setSelectedGiftItem("");
      })
      .catch((error) => {
        enqueueSnackbar(error.message || "Failed to send gift", { variant: "error" });
      });
  };

  const handleRemoveItem = async (userId: string, itemKey: string) => {
    removeItem(userId, itemKey)
      .then(() => {
        enqueueSnackbar("Item removed", { variant: "success" });
        // Update selected user inventory
        if (selectedUser) {
          setSelectedUser({
            ...selectedUser,
            inventory: selectedUser.inventory?.filter(i => i.itemKey !== itemKey) || [],
          });
        }
      })
      .catch((error) => {
        enqueueSnackbar(error.message || "Failed to remove item", { variant: "error" });
      });
  };

  const isCurrentUser = selectedUser?._id === profile?._id;

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Box>
      <Container maxWidth="lg">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
            Users
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Manage and view all users in the system
          </Typography>

          <TextField
            fullWidth
            placeholder="Search users by username, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3, maxWidth: 600 }}
          />
        </Box>

        {filteredUsers.length === 0 ? (
          <Alert severity="info">No users found{searchQuery ? " matching your search" : ""}.</Alert>
        ) : (
          <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Roles</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user._id} hover onClick={() => handleUserClick(user)} sx={{ cursor: "pointer" }}>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <Avatar
                            src={user.avatar || undefined}
                            sx={{ width: 40, height: 40, borderRadius: 1.5 }}
                          >
                            {user.username?.charAt(0).toUpperCase()}
                          </Avatar>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {user.username}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {user.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((role, index) => (
                              <Chip
                                key={index}
                                label={role}
                                size="small"
                                color={getRoleColor(role) as any}
                                sx={{ fontWeight: 600 }}
                              />
                            ))
                          ) : (
                            <Chip label="User" size="small" color="default" sx={{ fontWeight: 600 }} />
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}

        <Box sx={{ mt: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Showing {filteredUsers.length} of {users.length} users
          </Typography>
        </Box>

        {/* User Details Modal */}
        <Dialog
          open={userModalOpen}
          onClose={handleCloseModal}
          PaperProps={{
            sx: {
              width: "80vw",
              height: "80vh",
              maxWidth: "none",
              maxHeight: "none",
            },
          }}
        >
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2, pb: 1 }}>
            <Avatar
              src={selectedUser?.avatar || undefined}
              sx={{ width: 48, height: 48, fontSize: "1.25rem" }}
            >
              {selectedUser?.username?.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {selectedUser?.username}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedUser?.email}
              </Typography>
            </Box>
            <IconButton onClick={handleCloseModal} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <Tabs
            value={activeTab}
            onChange={(e, v) => setActiveTab(v)}
            sx={{
              px: 2,
              borderBottom: 1,
              borderColor: "divider",
              "& .MuiTab-root": {
                textTransform: "none",
                minHeight: 48,
              },
            }}
          >
            <Tab icon={<PersonIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Info" />
            <Tab icon={<InventoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Inventory" />
            <Tab icon={<SettingsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Misc" />
          </Tabs>
          <DialogContent sx={{ p: 3 }}>
            {activeTab === 0 && selectedUser && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 4 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Points</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: "primary.main" }}>
                      {selectedUser.points?.toLocaleString() || 0}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Roles</Typography>
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      {selectedUser.roles?.map((role) => (
                        <Chip
                          key={role}
                          label={role}
                          size="small"
                          color={getRoleColor(role) as any}
                          sx={{ fontWeight: 600, textTransform: "capitalize" }}
                        />
                      ))}
                    </Box>
                  </Box>
                </Box>
                {selectedUser.xenbox && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>XenBox</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {formatFileSize(selectedUser.xenbox.spaceUsed)} / {formatFileSize(selectedUser.xenbox.spaceAllowed)}
                      <Typography component="span" variant="caption" color="text.secondary"> ({selectedUser.xenbox.fileCount} files)</Typography>
                    </Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>User ID</Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {selectedUser._id}
                  </Typography>
                </Box>
              </Box>
            )}

            {activeTab === 1 && selectedUser && (
              <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Give Item
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <TextField
                      select
                      size="small"
                      value={selectedGiftItem}
                      onChange={(e) => setSelectedGiftItem(e.target.value)}
                      sx={{ flex: 1 }}
                    >
                      {ITEM_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      variant="contained"
                      color="warning"
                      size="small"
                      onClick={handleGiveGift}
                      disabled={isGivingItem || !selectedGiftItem}
                    >
                      {isGivingItem ? "Sending..." : "Give"}
                    </Button>
                  </Box>
                </Box>

                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Current Inventory ({selectedUser.inventory?.length || 0})
                </Typography>
                {!selectedUser.inventory || selectedUser.inventory.length === 0 ? (
                  <Box sx={{ py: 4, textAlign: "center" }}>
                    <InventoryIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                    <Typography color="text.secondary">No items in inventory</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1, overflow: "auto", flex: 1 }}>
                    {selectedUser.inventory.map((item, index) => (
                      <Box key={index} sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                        <Avatar src={item.image} sx={{ width: 40, height: 40 }} variant="rounded" />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.description}</Typography>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Received</Typography>
                          <Typography variant="caption">{new Date(item.purchasedAt).toLocaleDateString()}</Typography>
                        </Box>
                        {item.used && <Chip label="Used" size="small" color="default" />}
                        {item.redeemable && !item.used && <Chip label="Redeemable" size="small" color="success" />}
                        <Tooltip title="Remove from inventory">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              handleRemoveItem(selectedUser._id, item.itemKey);
                            }}
                            disabled={isRemovingItem}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {activeTab === 2 && selectedUser && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                    XenBox Quota
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <TextField
                      placeholder="e.g., 5 GB"
                      value={editingQuota}
                      onChange={(e) => setEditingQuota(e.target.value)}
                      size="small"
                      sx={{ width: 200 }}
                      InputProps={{
                        startAdornment: <StorageIcon sx={{ fontSize: 18, mr: 1, color: "text.secondary" }} />,
                      }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveQuota}
                      disabled={isUpdatingUser || editingQuota === (selectedUser.xenbox?.spaceAllowed ? formatFileSize(selectedUser.xenbox.spaceAllowed) : "")}
                    >
                      {isUpdatingUser ? "Saving..." : "Update"}
                    </Button>
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                    Avatar
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontFamily: "monospace", fontSize: "0.75rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={selectedUser.avatar}
                    >
                      {selectedUser.avatar || "No avatar set"}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<RestartAltIcon />}
                      onClick={handleResetAvatar}
                      disabled={isResettingAvatar || !selectedUser.avatar}
                      color="warning"
                    >
                      Reset
                    </Button>
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                    Danger Zone
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<DeleteIcon />}
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={isDeletingUser}
                  >
                    Delete User
                  </Button>
                </Box>
              </Box>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
          <DialogTitle>Delete User</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete user <strong>{selectedUser?.username}</strong>? This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmOpen(false)} disabled={isDeletingUser}>
              Cancel
            </Button>
            <Button onClick={handleDeleteUser} color="error" variant="contained" disabled={isDeletingUser}>
              {isDeletingUser ? "Deleting..." : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
