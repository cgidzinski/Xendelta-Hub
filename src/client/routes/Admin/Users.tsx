import React, { useState, useEffect } from "react";
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
  Switch,
  FormControlLabel,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useSnackbar } from "notistack";
import { get, put, del, post } from "../../utils/apiClient";
import { useTitle } from "../../hooks/useTitle";
import { useUserProfile } from "../../hooks/user/useUserProfile";

interface User {
  _id: string;
  username: string;
  email: string;
  roles?: string[];
  avatar?: string;
  canRespond?: boolean;
}

const AVAILABLE_ROLES = ["admin", "bot", "user"];

export default function Users() {
  useTitle("Users");
  const { enqueueSnackbar } = useSnackbar();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);
  const [editingCanRespond, setEditingCanRespond] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResettingAvatar, setIsResettingAvatar] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredUsers(users);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        users.filter(
          (user) =>
            user.username.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query) ||
            user.roles?.some((role) => role.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, users]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = await get<{ users: User[] }>("/api/admin/users");
      setUsers(data.users || []);
      setFilteredUsers(data.users || []);
    } catch (error: any) {
      enqueueSnackbar(error.message || "Failed to fetch users", { variant: "error" });
    } finally {
      setIsLoading(false);
    }
  };

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
    setEditingCanRespond(user.canRespond !== false);
    setUserModalOpen(true);
  };

  const handleCloseModal = () => {
    setUserModalOpen(false);
    setSelectedUser(null);
    setEditingRoles([]);
    setEditingCanRespond(true);
  };

  const handleSaveRoles = async () => {
    if (!selectedUser) return;
    setIsSaving(true);
    try {
      await put(`/api/admin/users/${selectedUser._id}/roles`, { roles: editingRoles });
      enqueueSnackbar("Roles updated successfully", { variant: "success" });
      await fetchUsers();
      // Update selected user
      const updatedUser = users.find(u => u._id === selectedUser._id);
      if (updatedUser) {
        setSelectedUser({ ...updatedUser, roles: editingRoles });
      }
    } catch (error: any) {
      enqueueSnackbar(error.message || "Failed to update roles", { variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCanRespond = async () => {
    if (!selectedUser) return;
    setIsSaving(true);
    try {
      await put(`/api/admin/users/${selectedUser._id}/booleans`, { canRespond: editingCanRespond });
      enqueueSnackbar("User updated successfully", { variant: "success" });
      await fetchUsers();
      // Update selected user
      const updatedUser = users.find(u => u._id === selectedUser._id);
      if (updatedUser) {
        setSelectedUser({ ...updatedUser, canRespond: editingCanRespond });
      }
    } catch (error: any) {
      enqueueSnackbar(error.message || "Failed to update user", { variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setIsDeleting(true);
    try {
      await del(`/api/admin/users/${selectedUser._id}`);
      enqueueSnackbar("User deleted successfully", { variant: "success" });
      setDeleteConfirmOpen(false);
      handleCloseModal();
      await fetchUsers();
    } catch (error: any) {
      enqueueSnackbar(error.message || "Failed to delete user", { variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetAvatar = async () => {
    if (!selectedUser) return;
    setIsResettingAvatar(true);
    try {
      await post(`/api/admin/users/${selectedUser._id}/avatar/reset`);
      enqueueSnackbar("Avatar reset successfully", { variant: "success" });
      await fetchUsers();
      // Update selected user
      const updatedUser = users.find(u => u._id === selectedUser._id);
      if (updatedUser) {
        setSelectedUser({ ...updatedUser, avatar: undefined });
      }
      // If it's the current user, refetch profile to update sidebar
      if (selectedUser._id === profile?._id) {
        refetchProfile();
      }
    } catch (error: any) {
      enqueueSnackbar(error.message || "Failed to reset avatar", { variant: "error" });
    } finally {
      setIsResettingAvatar(false);
    }
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
                      disabled={isSaving || JSON.stringify(editingRoles.sort()) === JSON.stringify((selectedUser.roles || []).sort())}
                    >
                      {isSaving ? "Saving..." : "Save Roles"}
                    </Button>
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={editingCanRespond}
                          onChange={(e) => setEditingCanRespond(e.target.checked)}
                        />
                      }
                      label="Can Respond to Messages"
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveCanRespond}
                      disabled={isSaving || editingCanRespond === (selectedUser.canRespond !== false)}
                    >
                      {isSaving ? "Saving..." : "Save Setting"}
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
              disabled={isDeleting}
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
            <Button onClick={() => setDeleteConfirmOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button onClick={handleDeleteUser} color="error" variant="contained" disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
