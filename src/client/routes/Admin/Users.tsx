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
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import { get } from "../../utils/apiClient";
import { useTitle } from "../../hooks/useTitle";

interface User {
  _id: string;
  username: string;
  email: string;
  roles?: string[];
  avatar?: string;
}

export default function Users() {
  useTitle("Users");
  const { enqueueSnackbar } = useSnackbar();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);

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
      const data = await get<{ users: User[] }>("/api/users");
      setUsers(data.users || []);
      setFilteredUsers(data.users || []);
    } catch (error: any) {
      enqueueSnackbar(error.message || "Failed to fetch users", { variant: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
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
    setUserModalOpen(true);
  };

  const handleCloseModal = () => {
    setUserModalOpen(false);
    setSelectedUser(null);
  };

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
                            src={user._id ? `/avatar/${user._id}` : undefined}
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
          maxWidth="sm"
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
                    src={selectedUser._id ? `/avatar/${selectedUser._id}` : undefined}
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
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {selectedUser.roles && selectedUser.roles.length > 0 ? (
                      selectedUser.roles.map((role, index) => (
                        <Chip
                          key={index}
                          label={role}
                          size="medium"
                          color={getRoleColor(role) as any}
                          sx={{ fontWeight: 600 }}
                        />
                      ))
                    ) : (
                      <Chip label="User" size="medium" color="default" sx={{ fontWeight: 600 }} />
                    )}
                  </Box>
                </Box>

                {selectedUser.avatar && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                      Avatar
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                      {selectedUser.avatar}
                    </Typography>
                  </Box>
                )}
              </Stack>
            )}
          </DialogContent>
        </Dialog>
      </Container>
    </Box>
  );
}
