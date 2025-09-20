import React, { useState } from "react";
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Avatar,
  Button,
  TextField,
  Paper,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Person as PersonIcon,
  Email as EmailIcon,
} from "@mui/icons-material";
import TitleBar from "../../components/TitleBar";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <Box>
      <TitleBar title="Profile" />
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Card elevation={3}>
          <CardContent sx={{ p: 4 }}>
            {/* Profile Header */}
            <Box sx={{ textAlign: "center", mb: 4 }}>
              <Avatar
                src={user.avatar}
                sx={{
                  width: 120,
                  height: 120,
                  mx: "auto",
                  mb: 2,
                  fontSize: "3rem",
                  bgcolor: "primary.main",
                }}
                style={{ cursor: "pointer" }}
              />

              <Typography variant="h4" component="h1" gutterBottom>
                {user.username}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {user.email}
              </Typography>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Profile Details */}
            <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3 }}>
              <Box sx={{ flex: 1 }}>
                <Paper elevation={1} sx={{ p: 3, height: "100%" }}>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                    <PersonIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">Username</Typography>
                  </Box>

                  <Typography variant="body1" color="text.secondary">
                    {user.username}
                  </Typography>
                </Paper>
              </Box>

              <Box sx={{ flex: 1 }}>
                <Paper elevation={1} sx={{ p: 3, height: "100%" }}>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                    <EmailIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">Email</Typography>
                  </Box>

                  <Typography variant="body1" color="text.secondary">
                    {user.email}
                  </Typography>
                </Paper>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Button sx={{ mt: 2 }} variant="contained" fullWidth color="primary" onClick={() => navigate("/logout")}>
          Logout
        </Button>
      </Container>
    </Box>
  );
}
