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
  Paper,
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
  Divider,
  Stack,
  Autocomplete,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import StorageIcon from "@mui/icons-material/Storage";
import { useSnackbar } from "notistack";
import { useTitle } from "../../hooks/useTitle";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import { useAdminUsers, User } from "../../hooks/admin/useAdminUsers";
import { formatFileSize } from "../../utils/fileUtils";

const AVAILABLE_ROLES = ["admin", "bot", "user"];

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
    refetch,
  } = useAdminUsers();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);
  const [editingQuota, setEditingQuota] = useState<string>("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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
      case "bot":
        return "info";
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
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
            },
          }}
        >
          <DialogTitle>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                User Details
              </Typography>
              <Button onClick={handleCloseModal} sx={{ minWidth: "auto", p: 0.5 }} color="inherit">
                <CloseIcon />
              </Button>
            </Box>
          </DialogTitle>
          <DialogContent>
            {selectedUser && (
              <Stack spacing={3}>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 2 }}>
                  <Avatar
                    src={selectedUser.avatar || undefined}
                    sx={{ width: 120, height: 120, borderRadius: 2, mb: 2 }}
                  >
                    {selectedUser.username?.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {selectedUser.username}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedUser.email}
                  </Typography>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                    User ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                    {selectedUser._id}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                    Roles
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Autocomplete
                      multiple
                      options={AVAILABLE_ROLES}
                      value={editingRoles}
                      onChange={(event, newValue) => {
                        setEditingRoles(newValue);
                      }}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => (
                          <Chip
                            {...getTagProps({ index })}
                            key={option}
                            label={option}
                            size="small"
                            color={getRoleColor(option) as any}
                            sx={{ fontWeight: 600 }}
                          />
                        ))
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Select roles"
                          size="small"
                        />
                      )}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveRoles}
                      disabled={isUpdatingUser || JSON.stringify(editingRoles.sort()) === JSON.stringify((selectedUser.roles || []).sort())}
                    >
                      {isUpdatingUser ? "Saving..." : "Save Roles"}
                    </Button>
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                    XenBox Quota
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    {selectedUser.xenbox && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Used: {formatFileSize(selectedUser.xenbox.spaceUsed)} / {formatFileSize(selectedUser.xenbox.spaceAllowed)}
                        {selectedUser.xenbox.fileCount > 0 && ` (${selectedUser.xenbox.fileCount} file${selectedUser.xenbox.fileCount !== 1 ? 's' : ''})`}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <TextField
                      placeholder="e.g., 5 GB or 1024 MB"
                      value={editingQuota}
                      onChange={(e) => setEditingQuota(e.target.value)}
                      size="small"
                      sx={{ flex: 1 }}
                      helperText="Enter quota in format like '5 GB', '1024 MB', etc."
                      InputProps={{
                        startAdornment: <StorageIcon sx={{ mr: 1, color: "text.secondary" }} />,
                      }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveQuota}
                      disabled={isUpdatingUser || editingQuota === (selectedUser.xenbox?.spaceAllowed ? formatFileSize(selectedUser.xenbox.spaceAllowed) : "")}
                    >
                      {isUpdatingUser ? "Saving..." : "Save Quota"}
                    </Button>
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                    Avatar
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      {selectedUser.avatar && (
                        <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                          {selectedUser.avatar}
                        </Typography>
                      )}
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<RestartAltIcon />}
                      onClick={handleResetAvatar}
                      disabled={isResettingAvatar}
                      color="warning"
                    >
                      {isResettingAvatar ? "Resetting..." : "Reset Avatar"}
                    </Button>
                  </Box>
                </Box>
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setDeleteConfirmOpen(true)}
              color="error"
              startIcon={<DeleteIcon />}
              disabled={isDeletingUser}
            >
              Delete User
            </Button>
            <Button onClick={handleCloseModal}>Close</Button>
          </DialogActions>
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
